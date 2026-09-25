/**
 * Template dell'email di riepilogo settimanale presenze (testo e HTML).
 * Separato dalla logica del job in `weekly-attendance-summary.ts`.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { calculateAttendanceHours, type AttendanceHoursRow } from './attendance-hours';
import { TIMEZONE } from '../utils/date';

export interface WeeklySummaryRecipient {
	firstName: string;
	lastName: string;
}

export interface WeeklySummaryEmailParams {
	subscriber: WeeklySummaryRecipient;
	weekStartDate: string;
	weekEndDate: string;
	weekRows: AttendanceHoursRow[];
	totalRows: AttendanceHoursRow[];
}

export interface WeeklySummaryEmail {
	subject: string;
	text: string;
	html: string;
}

function formatDateTime(value: Date | string): string {
	return formatInTimeZone(value, TIMEZONE, 'dd/MM/yyyy HH:mm');
}

function formatDate(value: string): string {
	const [year, month, day] = value.split('-');
	return `${day}/${month}/${year}`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function buildWeeklySummaryEmail(params: WeeklySummaryEmailParams): WeeklySummaryEmail {
	const weekCalculation = calculateAttendanceHours(params.weekRows);
	const totalCalculation = calculateAttendanceHours(params.totalRows);
	const fullName = `${params.subscriber.firstName} ${params.subscriber.lastName}`.trim();
	const period = `${formatDate(params.weekStartDate)} - ${formatDate(params.weekEndDate)}`;
	const subject = `Riepilogo presenze ${period}`;
	const eventLines = params.weekRows.map(
		(row) =>
			`- ${formatDateTime(row.readTimestamp)}: ${row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}`
	);
	const sessionLines = weekCalculation.sessions.map(
		(session) =>
			`- ${formatDateTime(session.entryAt)} - ${formatDateTime(session.exitAt)}: ${session.durationLabel}`
	);

	const text = [
		`Ciao ${fullName},`,
		'',
		`questo e' il riepilogo delle presenze dal ${period}.`,
		'',
		'Ingressi e uscite:',
		...(eventLines.length ? eventLines : ['- Nessuna strisciata valida']),
		'',
		'Sessioni calcolate:',
		...(sessionLines.length ? sessionLines : ['- Nessuna sessione completa']),
		'',
		`Monte ore della settimana: ${weekCalculation.totalLabel}`,
		`Monte ore totale fino al ${formatDate(params.weekEndDate)}: ${totalCalculation.totalLabel}`
	].join('\n');

	const eventRows = params.weekRows
		.map(
			(row) =>
				`<tr><td>${escapeHtml(formatDateTime(row.readTimestamp))}</td><td>${
					row.eventType === 'entry' ? 'Ingresso' : 'Uscita'
				}</td></tr>`
		)
		.join('');
	const sessionRows = weekCalculation.sessions
		.map(
			(session) =>
				`<tr><td>${escapeHtml(formatDateTime(session.entryAt))}</td><td>${escapeHtml(
					formatDateTime(session.exitAt)
				)}</td><td>${escapeHtml(session.durationLabel)}</td></tr>`
		)
		.join('');

	const html = `<!doctype html>
<html lang="it">
<body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
	<p>Ciao ${escapeHtml(fullName)},</p>
	<p>questo e' il riepilogo delle presenze dal <strong>${escapeHtml(period)}</strong>.</p>
	<h2 style="font-size: 16px;">Ingressi e uscite</h2>
	<table cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #d1d5db;">
		<thead><tr><th align="left">Data/ora</th><th align="left">Evento</th></tr></thead>
		<tbody>${eventRows || '<tr><td colspan="2">Nessuna strisciata valida</td></tr>'}</tbody>
	</table>
	<h2 style="font-size: 16px;">Sessioni calcolate</h2>
	<table cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #d1d5db;">
		<thead><tr><th align="left">Ingresso</th><th align="left">Uscita</th><th align="left">Durata</th></tr></thead>
		<tbody>${sessionRows || '<tr><td colspan="3">Nessuna sessione completa</td></tr>'}</tbody>
	</table>
	<p><strong>Monte ore della settimana:</strong> ${escapeHtml(weekCalculation.totalLabel)}</p>
	<p><strong>Monte ore totale fino al ${escapeHtml(formatDate(params.weekEndDate))}:</strong> ${escapeHtml(
		totalCalculation.totalLabel
	)}</p>
</body>
</html>`;

	return { subject, text, html };
}
