import { ValidationError } from 'shared';

/**
 * A `400` that points at one field (PROJECT_SPEC.md §3.7).
 *
 * The distinction it encodes is worth keeping straight, because getting it
 * wrong produces a confusing screen rather than an obviously broken one: when
 * a *path parameter* names something that does not exist, the resource is
 * missing and the answer is a `404`. When a *field in the body* names
 * something that does not exist, the resource is fine and the form is wrong —
 * and the client needs to know which input to put the message under.
 *
 * The shape matches what the Zod adapter produces for a schema failure
 * (B0.7.3), so a form renders a rule enforced in a service and a rule enforced
 * in a schema the same way.
 */
export function fieldError(path: string, message: string): ValidationError {
  return new ValidationError('Uppgifterna kunde inte valideras.', {
    details: [{ path, message }],
  });
}
