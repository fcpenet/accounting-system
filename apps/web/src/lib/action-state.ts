/** Shared shape for `useActionState` results across every form in the app. */
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set on success for forms that stay on the page. */
  ok?: boolean;
}

export const idle: ActionState = {};

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState {
  return fieldErrors ? { error, fieldErrors } : { error };
}
