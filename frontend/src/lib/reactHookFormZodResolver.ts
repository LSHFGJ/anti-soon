import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

interface ResolverErrorTree {
	[key: string]: FieldError | ResolverErrorTree;
}

const assignNestedError = (
	errors: ResolverErrorTree,
	path: readonly (string | number)[],
	error: FieldError,
): void => {
	if (path.length === 0) {
		return;
	}

	const [head, ...tail] = path;
	const key = String(head);

	if (tail.length === 0) {
		errors[key] = error;
		return;
	}

	const existingChild = errors[key];
	const nextErrors =
		typeof existingChild === "object" && existingChild !== null && !("type" in existingChild)
			? existingChild
			: {};

	errors[key] = nextErrors;
	assignNestedError(nextErrors, tail, error);
};

const toFieldErrors = <TFieldValues extends FieldValues>(
	issues: readonly z.ZodIssue[],
): FieldErrors<TFieldValues> => {
	const errors: ResolverErrorTree = {};

	for (const issue of issues) {
		assignNestedError(errors, issue.path, {
			type: issue.code,
			message: issue.message,
		});
	}

	return errors as FieldErrors<TFieldValues>;
};

export const createReactHookFormZodResolver = <TSchema extends z.ZodTypeAny>(
	schema: TSchema,
): Resolver<z.input<TSchema>, unknown, z.output<TSchema>> => {
	return async (values) => {
		const result = await schema.safeParseAsync(values);

		if (result.success) {
			return {
				values: result.data,
				errors: {},
			};
		}

		return {
			values: {},
			errors: toFieldErrors<z.input<TSchema>>(result.error.issues),
		};
	};
};
