import { studentRequest } from "./student";
export function learningRequest<T>(
  path: string,
  options: Parameters<typeof studentRequest>[1] = {},
) {
  return studentRequest<T>(path, { ...options, prefix: "/api/v1/learning" });
}
