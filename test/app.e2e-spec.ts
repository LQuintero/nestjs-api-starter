import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { prepareE2eDatabase } from './e2e-database';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    prepareE2eDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns 200', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect({
      status: 'ok',
    });
  });

  it('GET /health/ready returns 200 when database is available', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        checks: { database: 'ok' },
      });
  });

  it('POST /auth/register creates a user and returns tokens', async () => {
    const email = `user-${Date.now()}@example.com`;

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'password-123',
        name: 'E2E User',
      })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it('POST /auth/login and GET /auth/me work with bearer token', async () => {
    const email = `login-${Date.now()}@example.com`;
    const password = 'password-123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(me.body.email).toBe(email);
    expect(me.body.roles).toEqual(expect.arrayContaining(['user']));
  });

  it('POST /auth/refresh rotates tokens and POST /auth/logout revokes refresh token', async () => {
    const email = `refresh-${Date.now()}@example.com`;
    const password = 'password-123';

    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(registered.body.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('GET /users is admin-protected', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
        password: process.env.SEED_ADMIN_PASSWORD ?? 'change-me-password',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(Array.isArray(response.body.data)).toBe(true);
      });
  });
});
