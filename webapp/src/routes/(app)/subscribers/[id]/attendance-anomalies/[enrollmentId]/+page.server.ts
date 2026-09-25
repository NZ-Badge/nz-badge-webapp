import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	AttendanceAnomalyError,
	applyAnomalyResolutions,
	getAnomalyResolutionView,
	loadResolutionContext,
	validateAnomalyResolutions
} from '$lib/services/attendance-anomalies';
import { getAuditRequestInfo } from '$lib/services/audit';
import { requirePageStaff } from '$lib/services/auth';

function parseNumericId(value: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		error(400, 'ID non valido');
	}

	return parsed;
}

async function withNotFound<T>(promise: Promise<T>): Promise<T> {
	try {
		return await promise;
	} catch (err) {
		if (err instanceof AttendanceAnomalyError) error(404, err.message);
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, locals }) => {
	await requirePageStaff(locals);

	const subscriberId = parseNumericId(params.id);
	const enrollmentId = parseNumericId(params.enrollmentId);
	return withNotFound(getAnomalyResolutionView(subscriberId, enrollmentId));
};

export const actions: Actions = {
	resolve: async (event) => {
		const user = await requirePageStaff(event.locals);
		const subscriberId = parseNumericId(event.params.id);
		const enrollmentId = parseNumericId(event.params.enrollmentId);
		const formData = await event.request.formData();
		const context = await withNotFound(loadResolutionContext(subscriberId, enrollmentId));

		const validation = validateAnomalyResolutions(context, (fieldName) => formData.get(fieldName));

		switch (validation.status) {
			case 'no_period':
				return fail(400, {
					action: 'resolve',
					error: 'Questa iscrizione non ha un periodo valido per il calcolo delle presenze.',
					fieldErrors: {},
					values: {}
				});
			case 'nothing_to_resolve':
				redirect(303, `/subscribers/${subscriberId}`);
				break;
			case 'stale':
				return fail(409, {
					action: 'resolve',
					error: 'Le anomalie sono cambiate nel frattempo. Ricarica la pagina.',
					fieldErrors: {},
					values: validation.values
				});
			case 'invalid':
				return fail(400, {
					action: 'resolve',
					error: 'Correggi i valori evidenziati e riprova.',
					fieldErrors: validation.fieldErrors,
					values: validation.values
				});
			case 'valid':
				await applyAnomalyResolutions({
					subscriberId,
					enrollmentId,
					resolutions: validation.resolutions,
					userId: user.id,
					...getAuditRequestInfo(event)
				});
				break;
		}

		redirect(303, `/subscribers/${subscriberId}`);
	}
};
