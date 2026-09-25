import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
	it('quotes every cell and escapes double quotes', () => {
		expect(csvCell('Mario')).toBe('"Mario"');
		expect(csvCell('A "mattina"')).toBe('"A ""mattina"""');
		expect(csvCell('uno,due;tre\nquattro')).toBe('"uno,due;tre\nquattro"');
	});

	it('renders nullish values as empty cells', () => {
		expect(csvCell(null)).toBe('""');
		expect(csvCell(undefined)).toBe('""');
	});

	it.each(['=SUM(1,1)', '+39 333', '-2+3', '@cmd', '\tvalue', '\rvalue', '  =1+1'])(
		'neutralizes formula injection in %j',
		(value) => {
			expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
		}
	);

	it('leaves numbers and ordinary strings untouched', () => {
		expect(csvCell(-5)).toBe('"-5"');
		expect(csvCell(0)).toBe('"0"');
		expect(csvCell(true)).toBe('"true"');
		expect(csvCell('mario@example.com')).toBe('"mario@example.com"');
		expect(csvCell('a=b')).toBe('"a=b"');
	});
});

describe('toCsv', () => {
	it('uses comma, LF and no BOM by default', () => {
		expect(
			toCsv(
				['nome', 'ore'],
				[
					['Mario', 3],
					['Luca', null]
				]
			)
		).toBe('"nome","ore"\n"Mario","3"\n"Luca",""\n');
	});

	it('supports custom separator, BOM and line ending', () => {
		const csv = toCsv(['Nome', 'Cognome'], [['Anna', 'Bianchi']], {
			separator: ';',
			bom: true,
			lineEnding: '\r\n'
		});
		expect(csv).toBe('﻿"Nome";"Cognome"\r\n"Anna";"Bianchi"\r\n');
	});

	it('emits only the header row when there are no rows', () => {
		expect(toCsv(['a'], [])).toBe('"a"\n');
	});
});
