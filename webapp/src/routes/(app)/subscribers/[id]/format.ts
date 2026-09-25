export function pluralize(value: number, singular: string, plural: string): string {
	return `${value} ${value === 1 ? singular : plural}`;
}

export function formatCourseDuration(days: number | null): string {
	if (days == null) return '—';
	return `${days} ${days === 1 ? 'giorno' : 'giorni'}`;
}
