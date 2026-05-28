type AttendanceEventType = 'entry' | 'exit';

export interface AttendanceHoursRow {
	id: number;
	eventType: AttendanceEventType;
	readTimestamp: Date | string;
	cardUid?: string | null;
	uidRaw?: string | null;
	subscriberId?: number | null;
	deviceId?: string | null;
}

export interface AttendanceHoursSession {
	entryAt: Date | string;
	exitAt: Date | string;
	durationMinutes: number;
	durationLabel: string;
}

export interface AttendanceHoursIssue {
	type: 'missing_exit' | 'missing_entry' | 'invalid_pair';
	message: string;
	timestamp: Date | string | null;
	relatedTimestamp?: Date | string | null;
	attendanceId?: number | null;
	isResolvable?: boolean;
}

export interface AttendanceHoursResolvableIssue {
	entryAttendanceId: number;
	entryAt: Date | string;
	nextEventAt: Date | string | null;
}

export interface AttendanceHoursCalculation {
	totalMinutes: number;
	totalLabel: string;
	validSessions: number;
	eventCount: number;
	sessions: AttendanceHoursSession[];
	issues: AttendanceHoursIssue[];
	resolvableIssues: AttendanceHoursResolvableIssue[];
}

export function formatAttendanceMinutes(totalMinutes: number): string {
	if (totalMinutes <= 0) return '0m';

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}

export function calculateAttendanceHours(
	attendanceRows: AttendanceHoursRow[]
): AttendanceHoursCalculation {
	const sortedRows = [...attendanceRows].sort(
		(a, b) => new Date(a.readTimestamp).getTime() - new Date(b.readTimestamp).getTime()
	);
	const sessions: AttendanceHoursSession[] = [];
	const issues: AttendanceHoursIssue[] = [];
	const resolvableIssues: AttendanceHoursResolvableIssue[] = [];
	let totalMinutes = 0;
	let openEntry: AttendanceHoursRow | null = null;

	for (const row of sortedRows) {
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
			durationLabel: formatAttendanceMinutes(durationMinutes)
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
		totalMinutes,
		totalLabel: formatAttendanceMinutes(totalMinutes),
		validSessions: sessions.length,
		eventCount: sortedRows.length,
		sessions,
		issues,
		resolvableIssues
	};
}
