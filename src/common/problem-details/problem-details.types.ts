export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string | undefined;
  instance?: string | undefined;
  traceId?: string | undefined;
}
