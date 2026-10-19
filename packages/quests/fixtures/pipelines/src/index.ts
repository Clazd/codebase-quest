declare const router: { use(...steps: unknown[]): void };

export function authenticate(): boolean {
  return true;
}

export function authorize(): boolean {
  return true;
}

export function respond(): string {
  return "ready";
}

router.use(authenticate, authorize, respond);

export function parseTask(): string {
  return "task";
}

export function saveTask(task: string): string {
  return task;
}

export function forward(): string {
  const task = parseTask();
  return saveTask(task);
}
