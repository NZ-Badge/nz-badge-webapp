import { addDaysToDateKey, romeDateKey, romeDayRange, romeDayStart } from '$lib/utils/date';
import type { EnrollmentScheduleMode } from '$lib/db/schema';
import {
	calculateAttendanceHours,
	type AttendanceHoursIssue,
	type AttendanceHoursResolvableIssue,
	type AttendanceHoursRow,
	type AttendanceHoursSession
} from '$lib/services/attendance-hours';

export type SubscriberAttendanceRow = AttendanceHoursRow;

export interface SubscriberEnrollmentRow {
	id: number;
	productTitle: string | null;
	variantTitle: string | null;
	startDate: Date | string | null;
	endDate?: Date | string | null;
	/**
	 * Giornate (`YYYY-MM-DD`) dei corsi non contigui. Se valorizzato, solo le timbrature di
	 * queste giornate entrano nel conteggio; assente o vuoto = corso contiguo (tutto l'intervallo).
	 */
	scheduleDays?: string[] | null;
	scheduleMode?: EnrollmentScheduleMode | null;
}

export type CourseAttendanceSession = AttendanceHoursSession;

export type CourseAttendanceIssue =
	| AttendanceHoursIssue
	| {
			type: 'missing_course_date';
			message: string;
			timestamp: Date | string | null;
	  };

export type CourseAttendanceResolvableIssue = AttendanceHoursResolvableIssue;

export interface CourseAttendanceSummary {
	enrollmentId: number;
	productTitle: string | null;
	variantTitle: string | null;
	startDate: Date | string | null;
	endDate: Date | string | null;
	periodLabel: string;
	totalMinutes: number;
	totalLabel: string;
	validSessions: number;
	eventCount: number;
	canCalculate: boolean;
	sessions: CourseAttendanceSession[];
	issues: CourseAttendanceIssue[];
	resolvableIssueCount: number;
	resolvableIssues: CourseAttendanceResolvableIssue[];
}

export interface SubscriberCourseAttendanceReportInput {
	subscriberId: number;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	enrollments: SubscriberEnrollmentRow[];
	attendanceRows: SubscriberAttendanceRow[];
}

export interface SubscriberCourseAttendanceReportRow {
	subscriberId: number;
	enrollmentId: number;
	name: string;
	email: string;
	course: string;
	startDate: Date | string | null;
	endDate: Date | string | null;
	totalMinutes: number;
	totalLabel: string;
	anomalyCount: number;
}

function toCourseDateKey(value: Date | string | null): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value.slice(0, 10);
	return romeDateKey(value);
}

function formatDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');
	return `${day}/${month}/${year}`;
}

export function getEnrollmentAttendancePeriod(
	enrollment: SubscriberEnrollmentRow
): { start: number; end: number; label: string } | null {
	const startDateKey = toCourseDateKey(enrollment.startDate);
	const endDateKey = toCourseDateKey(enrollment.endDate ?? null);

	if (!startDateKey || !endDateKey) return null;

	const range = romeDayRange(startDateKey, endDateKey);
	const start = range.start.getTime();
	const end = range.end.getTime();

	if (end <= start) return null;

	return {
		start,
		end,
		label: `${formatDateKey(startDateKey)} - ${formatDateKey(endDateKey)}`
	};
}

function getScheduleDaySet(enrollment: SubscriberEnrollmentRow): Set<string> | null {
	return enrollment.scheduleDays && enrollment.scheduleDays.length > 0
		? new Set(enrollment.scheduleDays)
		: null;
}

/**
 * Fine (esclusa) del tratto di corso che contiene `timestamp`: per i corsi contigui la fine del
 * periodo, per quelli non contigui la mezzanotte dopo l'ultima giornata consecutiva del blocco
 * che contiene il giorno della timbratura.
 */
export function getEnrollmentCourseBlockEnd(
	enrollment: SubscriberEnrollmentRow,
	timestamp: Date | string
): number | null {
	const periodEnd = getEnrollmentAttendancePeriod(enrollment)?.end ?? null;
	const days = getScheduleDaySet(enrollment);
	if (!days) return periodEnd;

	let lastDay = romeDateKey(timestamp);
	while (days.has(addDaysToDateKey(lastDay, 1))) lastDay = addDaysToDateKey(lastDay, 1);
	const blockEnd = romeDayStart(addDaysToDateKey(lastDay, 1)).getTime();
	return periodEnd === null ? blockEnd : Math.min(blockEnd, periodEnd);
}

export type EnrollmentCourseState = 'active' | 'expired';

/**
 * A course is expired once its end date (a Europe/Rome calendar day) is in the past;
 * without an end date it stays active.
 */
export function getEnrollmentCourseState(
	endDate: Date | string | null,
	now: Date = new Date()
): EnrollmentCourseState {
	const endDateKey = toCourseDateKey(endDate);
	return endDateKey && endDateKey < romeDateKey(now) ? 'expired' : 'active';
}

export function buildSubscriberCourseAttendanceSummary(
	enrollment: SubscriberEnrollmentRow,
	attendanceRows: SubscriberAttendanceRow[]
): CourseAttendanceSummary {
	return buildSubscriberCourseAttendanceSummaries([enrollment], attendanceRows)[0];
}

export function buildSubscriberCourseAttendanceSummaries(
	enrollments: SubscriberEnrollmentRow[],
	attendanceRows: SubscriberAttendanceRow[]
): CourseAttendanceSummary[] {
	return enrollments.map((enrollment) => {
		const period = getEnrollmentAttendancePeriod(enrollment);

		if (!period) {
			return {
				enrollmentId: enrollment.id,
				productTitle: enrollment.productTitle,
				variantTitle: enrollment.variantTitle,
				startDate: enrollment.startDate,
				endDate: enrollment.endDate ?? null,
				periodLabel: '—',
				totalMinutes: 0,
				totalLabel: '—',
				validSessions: 0,
				eventCount: 0,
				canCalculate: false,
				sessions: [],
				issues: [
					{
						type: 'missing_course_date',
						message: 'Data corso mancante',
						timestamp: null
					}
				],
				resolvableIssueCount: 0,
				resolvableIssues: []
			};
		}

		const scheduleDays = getScheduleDaySet(enrollment);
		const relevantRows = attendanceRows.filter((row) => {
			const timestamp = new Date(row.readTimestamp).getTime();
			if (timestamp < period.start || timestamp >= period.end) return false;
			return !scheduleDays || scheduleDays.has(romeDateKey(row.readTimestamp));
		});
		const calculation = calculateAttendanceHours(relevantRows);

		return {
			enrollmentId: enrollment.id,
			productTitle: enrollment.productTitle,
			variantTitle: enrollment.variantTitle,
			startDate: enrollment.startDate,
			endDate: enrollment.endDate ?? null,
			periodLabel: scheduleDays
				? `${period.label} (${scheduleDays.size} ${scheduleDays.size === 1 ? 'giornata' : 'giornate'})`
				: period.label,
			totalMinutes: calculation.totalMinutes,
			totalLabel: calculation.totalLabel,
			validSessions: calculation.validSessions,
			eventCount: calculation.eventCount,
			canCalculate: true,
			sessions: calculation.sessions,
			issues: calculation.issues,
			resolvableIssueCount: calculation.resolvableIssues.length,
			resolvableIssues: calculation.resolvableIssues
		};
	});
}

export function buildSubscriberCourseAttendanceReportRows(
	subscribers: SubscriberCourseAttendanceReportInput[]
): SubscriberCourseAttendanceReportRow[] {
	return subscribers.flatMap((subscriber) => {
		const summaries = buildSubscriberCourseAttendanceSummaries(
			subscriber.enrollments,
			subscriber.attendanceRows
		);
		const name = [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim();

		return summaries.map((summary) => ({
			subscriberId: subscriber.subscriberId,
			enrollmentId: summary.enrollmentId,
			name,
			email: subscriber.email ?? '',
			course: [summary.productTitle, summary.variantTitle].filter(Boolean).join(' - '),
			startDate: summary.startDate,
			endDate: summary.endDate,
			totalMinutes: summary.totalMinutes,
			totalLabel: summary.totalLabel,
			anomalyCount: summary.resolvableIssueCount
		}));
	});
}
