import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TIMEZONE } from '$lib/utils/date';
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

function toCourseDateKey(value: Date | string | null): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value.slice(0, 10);
	return formatInTimeZone(value, TIMEZONE, 'yyyy-MM-dd');
}

function addDaysToDateKey(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
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

	const start = fromZonedTime(`${startDateKey}T00:00:00.000`, TIMEZONE).getTime();
	const end = fromZonedTime(`${addDaysToDateKey(endDateKey, 1)}T00:00:00.000`, TIMEZONE).getTime();

	if (end <= start) return null;

	return {
		start,
		end,
		label: `${formatDateKey(startDateKey)} - ${formatDateKey(endDateKey)}`
	};
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

		const relevantRows = attendanceRows.filter((row) => {
			const timestamp = new Date(row.readTimestamp).getTime();
			return timestamp >= period.start && timestamp < period.end;
		});
		const calculation = calculateAttendanceHours(relevantRows);

		return {
			enrollmentId: enrollment.id,
			productTitle: enrollment.productTitle,
			variantTitle: enrollment.variantTitle,
			startDate: enrollment.startDate,
			endDate: enrollment.endDate ?? null,
			periodLabel: period.label,
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
