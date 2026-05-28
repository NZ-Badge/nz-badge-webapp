import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE } from '$lib/utils/date';

type AttendanceEventType = 'entry' | 'exit';

export interface SubscriberAttendanceRow {
	id: number;
	eventType: AttendanceEventType;
	readTimestamp: Date | string;
	cardUid?: string | null;
	uidRaw?: string | null;
	subscriberId?: number | null;
	deviceId?: string | null;
}

export interface SubscriberEnrollmentRow {
	id: number;
	productTitle: string | null;
	variantTitle: string | null;
	startDate: Date | string | null;
	endDate?: Date | string | null;
}

export interface CourseAttendanceSession {
	entryAt: Date | string;
	exitAt: Date | string;
	durationMinutes: number;
	durationLabel: string;
}

export interface CourseAttendanceIssue {
	type: 'missing_exit' | 'missing_entry' | 'invalid_pair' | 'missing_course_date';
	message: string;
	timestamp: Date | string | null;
	relatedTimestamp?: Date | string | null;
	attendanceId?: number | null;
	isResolvable?: boolean;
}

export interface CourseAttendanceResolvableIssue {
	entryAttendanceId: number;
	entryAt: Date | string;
	nextEventAt: Date | string | null;
}

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

const MONTH_NAMES = new Map<string, number>([
	['gennaio', 0],
	['febbraio', 1],
	['marzo', 2],
	['aprile', 3],
	['maggio', 4],
	['giugno', 5],
	['luglio', 6],
	['agosto', 7],
	['settembre', 8],
	['ottobre', 9],
	['novembre', 10],
	['dicembre', 11],
	['january', 0],
	['february', 1],
	['march', 2],
	['april', 3],
	['may', 4],
	['june', 5],
	['july', 6],
	['august', 7],
	['september', 8],
	['october', 9],
	['november', 10],
	['december', 11]
]);

function formatMinutes(totalMinutes: number): string {
	if (totalMinutes <= 0) return '0m';

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}

function toCourseDateKey(value: Date | string | null): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value.slice(0, 10);
	return formatInTimeZone(value, TIMEZONE, 'yyyy-MM-dd');
}

function parseCourseMonthFromVariant(
	variantTitle: string | null
): { year: number; month: number } | null {
	if (!variantTitle) return null;

	const normalized = variantTitle.toLowerCase();
	const monthName = [...MONTH_NAMES.keys()].find((candidate) => normalized.includes(candidate));
	const yearMatch = normalized.match(/\b(20\d{2})\b/);

	if (!monthName || !yearMatch) return null;

	return {
		year: Number(yearMatch[1]),
		month: MONTH_NAMES.get(monthName) ?? 0
	};
}

export function getEnrollmentAttendancePeriod(
	enrollment: SubscriberEnrollmentRow
): { start: number; end: number; label: string } | null {
	const startDateKey = toCourseDateKey(enrollment.startDate);
	const endDateKey = toCourseDateKey(enrollment.endDate ?? null);

	if (startDateKey && endDateKey) {
		const startDate = new Date(`${startDateKey}T00:00:00.000Z`);
		const endDate = new Date(`${endDateKey}T00:00:00.000Z`);
		const exclusiveEnd = Date.UTC(
			endDate.getUTCFullYear(),
			endDate.getUTCMonth(),
			endDate.getUTCDate() + 1,
			0,
			0,
			0,
			0
		);

		return {
			start: Date.UTC(
				startDate.getUTCFullYear(),
				startDate.getUTCMonth(),
				startDate.getUTCDate(),
				0,
				0,
				0,
				0
			),
			end: exclusiveEnd,
			label: `${formatInTimeZone(startDate, TIMEZONE, 'dd/MM/yyyy')} - ${formatInTimeZone(
				endDate,
				TIMEZONE,
				'dd/MM/yyyy'
			)}`
		};
	}

	const fromVariant = parseCourseMonthFromVariant(enrollment.variantTitle);
	if (fromVariant) {
		return {
			start: Date.UTC(fromVariant.year, fromVariant.month, 1, 0, 0, 0, 0),
			end: Date.UTC(fromVariant.year, fromVariant.month + 1, 1, 0, 0, 0, 0),
			label: `${enrollment.variantTitle}`
		};
	}

	if (!startDateKey) return null;

	const fallbackDate = new Date(`${startDateKey}T00:00:00.000Z`);

	return {
		start: Date.UTC(fallbackDate.getUTCFullYear(), fallbackDate.getUTCMonth(), 1, 0, 0, 0, 0),
		end: Date.UTC(fallbackDate.getUTCFullYear(), fallbackDate.getUTCMonth() + 1, 1, 0, 0, 0, 0),
		label: formatInTimeZone(fallbackDate, TIMEZONE, 'MM/yyyy')
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
	const sortedAttendanceRows = [...attendanceRows].sort(
		(a, b) => new Date(a.readTimestamp).getTime() - new Date(b.readTimestamp).getTime()
	);

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

		const relevantRows = sortedAttendanceRows.filter((row) => {
			const timestamp = new Date(row.readTimestamp).getTime();
			return timestamp >= period.start && timestamp < period.end;
		});
		const sessions: CourseAttendanceSession[] = [];
		const issues: CourseAttendanceIssue[] = [];
		const resolvableIssues: CourseAttendanceResolvableIssue[] = [];
		let totalMinutes = 0;
		let openEntry: SubscriberAttendanceRow | null = null;

		for (const row of relevantRows) {
			if (row.eventType === 'entry') {
				if (openEntry) {
					issues.push({
						type: 'missing_exit',
						message: 'Uscita mancante',
						timestamp: openEntry.readTimestamp,
						relatedTimestamp: row.readTimestamp,
						attendanceId: openEntry.id,
						isResolvable: true
					});
					resolvableIssues.push({
						entryAttendanceId: openEntry.id,
						entryAt: openEntry.readTimestamp,
						nextEventAt: row.readTimestamp
					});
				}

				openEntry = row;
				continue;
			}

			if (!openEntry) {
				issues.push({
					type: 'missing_entry',
					message: 'Entrata mancante',
					timestamp: row.readTimestamp,
					isResolvable: false
				});
				continue;
			}

			const entryTime = new Date(openEntry.readTimestamp).getTime();
			const exitTime = new Date(row.readTimestamp).getTime();
			const durationMinutes = Math.round((exitTime - entryTime) / 60000);

			if (durationMinutes <= 0) {
				issues.push({
					type: 'invalid_pair',
					message: 'Uscita precedente all’entrata',
					timestamp: openEntry.readTimestamp,
					relatedTimestamp: row.readTimestamp,
					isResolvable: false
				});
				openEntry = null;
				continue;
			}

			sessions.push({
				entryAt: openEntry.readTimestamp,
				exitAt: row.readTimestamp,
				durationMinutes,
				durationLabel: formatMinutes(durationMinutes)
			});
			totalMinutes += durationMinutes;
			openEntry = null;
		}

		if (openEntry) {
			issues.push({
				type: 'missing_exit',
				message: 'Uscita mancante',
				timestamp: openEntry.readTimestamp,
				attendanceId: openEntry.id,
				isResolvable: true
			});
			resolvableIssues.push({
				entryAttendanceId: openEntry.id,
				entryAt: openEntry.readTimestamp,
				nextEventAt: null
			});
		}

		return {
			enrollmentId: enrollment.id,
			productTitle: enrollment.productTitle,
			variantTitle: enrollment.variantTitle,
			startDate: enrollment.startDate,
			endDate: enrollment.endDate ?? null,
			periodLabel: period.label,
			totalMinutes,
			totalLabel: formatMinutes(totalMinutes),
			validSessions: sessions.length,
			eventCount: relevantRows.length,
			canCalculate: true,
			sessions,
			issues,
			resolvableIssueCount: resolvableIssues.length,
			resolvableIssues
		};
	});
}
