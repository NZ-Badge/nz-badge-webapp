export type CsvValue = string | number | bigint | boolean | null | undefined;

export type CsvOptions = {
	/** Separatore di campo (default `,`). */
	separator?: string;
	/** Antepone il BOM UTF-8, utile per l'apertura corretta in Excel (default `false`). */
	bom?: boolean;
	/** Terminatore di riga (default `\n`). */
	lineEnding?: string;
};

// Celle che un foglio di calcolo potrebbe interpretare come formula (CSV/formula injection),
// anche se precedute da spazi, oppure che iniziano con TAB o CR.
const FORMULA_PREFIX = /^(?:\s*[=+\-@]|[\t\r])/;

/**
 * Converte un valore in una cella CSV sempre racchiusa tra virgolette doppie.
 * Le stringhe che potrebbero essere eseguite come formula vengono prefissate con `'`;
 * i valori numerici non vengono alterati.
 */
export function csvCell(value: CsvValue): string {
	if (value === null || value === undefined) return '""';
	let text = String(value);
	if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}

/** Genera un documento CSV completo, con terminatore di riga anche dopo l'ultima riga. */
export function toCsv(
	headers: readonly string[],
	rows: ReadonlyArray<readonly CsvValue[]>,
	options: CsvOptions = {}
): string {
	const { separator = ',', bom = false, lineEnding = '\n' } = options;
	const lines = [headers, ...rows].map((row) => row.map(csvCell).join(separator));
	return `${bom ? '﻿' : ''}${lines.join(lineEnding)}${lineEnding}`;
}
