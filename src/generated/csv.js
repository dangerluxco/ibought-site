// GENERATED from ibought-app/utils/csv.ts by scripts/sync-lib.js. Do not edit.
// Parser for the order file in Amazon's "Request Your Data" export
// (Retail.OrderHistory.1.csv). Pure: runs under Node in the parser test.
import { toIsoDate } from './amazon.js';
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (quoted) {
            if (c === '"') {
                if (src[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else
                    quoted = false;
            }
            else
                cell += c;
        }
        else if (c === '"')
            quoted = true;
        else if (c === ',') {
            row.push(cell);
            cell = '';
        }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && src[i + 1] === '\n')
                i++;
            row.push(cell);
            cell = '';
            if (row.length > 1 || row[0] !== '')
                rows.push(row);
            row = [];
        }
        else
            cell += c;
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}
export function parseOrderHistoryCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2)
        return { items: [], error: 'That file is empty.' };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => header.indexOf(name);
    const iAsin = col('asin');
    const iName = col('product name');
    const iDate = col('order date');
    const iStatus = col('order status');
    if (iAsin < 0 || iName < 0) {
        return {
            items: [],
            error: 'That is not an Amazon order history file. Look for Retail.OrderHistory.1.csv in the export.',
        };
    }
    const byAsin = new Map();
    for (const r of rows.slice(1)) {
        const asin = (r[iAsin] || '').trim().toUpperCase();
        const title = (r[iName] || '').trim();
        if (!/^[A-Z0-9]{10}$/.test(asin) || !title)
            continue;
        if (iStatus >= 0 && /cancel/i.test(r[iStatus] || ''))
            continue;
        const orderDate = iDate >= 0 ? toIsoDate(r[iDate]) : null;
        const prev = byAsin.get(asin);
        // Keep the most recent purchase date for a repeat buy.
        if (!prev || (orderDate && (!prev.orderDate || orderDate > prev.orderDate))) {
            byAsin.set(asin, { asin, title, image: null, orderDate });
        }
    }
    return { items: [...byAsin.values()], error: null };
}
