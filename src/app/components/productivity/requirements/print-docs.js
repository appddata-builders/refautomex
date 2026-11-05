/**
 * Documentos de Compras que se imprimen: el comprobante de pago de una poliza,
 * el contra recibo de facturas a revision y el pedido a un proveedor. Cada uno
 * es HTML suelto para una ventana aparte; `t` llega por parametro porque se
 * arma fuera del arbol de React.
 */

export const escapeHtml = (value = '') => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const formatCurrency = (value = 0) =>
    (Number(value) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// Las fechas llegan como 'YYYY-MM-DD'. Con new Date('2026-11-04') el navegador
// las toma como UTC y en Mexico se ve el dia anterior.
export const formatDate = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
    if (!value) return '—';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('es-MX', options);
};

export const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Importe con letra, como lo imprimia la poliza del sistema anterior:
// 1204.08 -> "MIL DOSCIENTOS CUATRO PESOS 08/100 M.N."
const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
    'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
    'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
    'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const upTo999 = (n) => {
    if (n === 100) return 'CIEN';
    const rest = n % 100;
    const tens = rest < 30
        ? UNIDADES[rest]
        : `${DECENAS[Math.floor(rest / 10)]}${rest % 10 ? ` Y ${UNIDADES[rest % 10]}` : ''}`;
    return [CENTENAS[Math.floor(n / 100)], tens].filter(Boolean).join(' ');
};

export const amountInWords = (amount) => {
    const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
    const pesos = Math.floor(cents / 100);
    const millions = Math.floor(pesos / 1e6);
    const thousands = Math.floor((pesos % 1e6) / 1000);
    const units = pesos % 1000;
    const words = [
        millions && (millions === 1 ? 'UN MILLÓN' : `${upTo999(millions)} MILLONES`),
        thousands && (thousands === 1 ? 'MIL' : `${upTo999(thousands)} MIL`),
        units && upTo999(units),
    ].filter(Boolean).join(' ') || 'CERO';
    const currency = pesos === 1 ? 'PESO' : millions && !thousands && !units ? 'DE PESOS' : 'PESOS';
    return `${words} ${currency} ${String(cents % 100).padStart(2, '0')}/100 M.N.`;
};

const STYLES = `
    * { box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; margin: 28px; color: #111827; background: #fff; font-size: 13px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { height: 56px; width: auto; }
    .brand strong { display: block; font-size: 17px; }
    .brand span { font-size: 12px; color: #6b7280; }
    .meta { text-align: right; line-height: 1.5; }
    .meta .doc { font-size: 16px; font-weight: 700; }
    .box { border: 1px solid #d1d5db; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-weight: 600; }
    .amount { font-size: 22px; font-weight: 800; }
    .words { font-style: italic; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 56px; }
    .signatures div { border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-size: 12px; }
    .note { color: #6b7280; font-size: 11px; margin-top: 10px; }
    .section { page-break-inside: avoid; margin-bottom: 26px; }
    .page-break { page-break-after: always; }
    @media print { body { margin: 12mm; } }
`;

// El logo negro, el mismo del ticket (component-print). refautomex_bn.svg es
// el del modo oscuro: claro, y en papel blanco casi no se ve.
const logoSrc = () => {
    const base = process.env.NEXT_PUBLIC_S3 || '';
    return base ? `${base.endsWith('/') ? base : `${base}/`}refautomex_n.svg` : '/file.svg';
};

const shell = ({ title, meta, body, t }) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><title>${escapeHtml(title)} · ${escapeHtml(t('meta.brand'))}</title><style>${STYLES}</style></head>
<body>
    <header>
        <div class="brand">
            <img src="${escapeHtml(logoSrc())}" alt="${escapeHtml(t('meta.brand'))}" />
            <div><strong>${escapeHtml(t('panel.print.companyName'))}</strong><span>${escapeHtml(t('panel.print.companyTagline'))}</span></div>
        </div>
        <div class="meta"><div class="doc">${escapeHtml(title)}</div>${meta.map((line) => `<div>${line}</div>`).join('')}</div>
    </header>
    ${body}
</body></html>`;

const field = (label, value, className = 'value') =>
    `<div><div class="label">${escapeHtml(label)}</div><div class="${className}">${value}</div></div>`;

// Comprobante de pago de una poliza (la de ahora o una del historial).
export const buildPaymentReceiptHtml = (policy, t) => {
    const invoices = policy.compras || [];
    const rows = invoices.map((invoice) => `<tr>
        <td>${escapeHtml(invoice.num_factura)}</td>
        <td>${escapeHtml(formatDate(invoice.fecha_compra))}</td>
        <td>${escapeHtml(formatDate(invoice.fecha_pago))}</td>
        <td class="num">${escapeHtml(formatCurrency(invoice.total))}</td>
    </tr>`).join('');
    const bank = policy.tipo === 'EFECTIVO' ? '—' : escapeHtml(policy.banco || '—');
    return shell({
        t,
        title: t('panel.capture.receiptTitle'),
        meta: [
            `${escapeHtml(t('panel.capture.policyNumber'))}: <b>${escapeHtml(policy.idpoliza)}</b>`,
            `${escapeHtml(t('panel.capture.policyDate'))}: <b>${escapeHtml(formatDate(policy.fecha_poliza, { day: '2-digit', month: 'long', year: 'numeric' }))}</b>`,
        ],
        body: `
        <div class="box">
            <div class="grid">
                ${field(t('panel.capture.provider'), escapeHtml(policy.empresa || '—'))}
                ${field(t('panel.capture.paidAmount'), escapeHtml(formatCurrency(policy.importe)), 'amount')}
                ${field(t('panel.capture.paymentType'), escapeHtml(t(`panel.capture.pay_${policy.tipo}`)))}
                ${field(t('panel.capture.bank'), bank)}
                ${field(t('panel.capture.reference'), escapeHtml(policy.referencia || '—'))}
                ${field(t('panel.capture.invoiceCount'), escapeHtml(invoices.length))}
            </div>
            <p class="words">${escapeHtml(t('panel.capture.amountInWords'))}: ${escapeHtml(amountInWords(policy.importe))}</p>
        </div>
        <h2>${escapeHtml(t('panel.capture.paidInvoices'))}</h2>
        <table>
            <thead><tr><th>${escapeHtml(t('panel.capture.invoice'))}</th><th>${escapeHtml(t('panel.capture.purchaseDate'))}</th><th>${escapeHtml(t('panel.capture.dueDate'))}</th><th class="num">${escapeHtml(t('panel.capture.amount'))}</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="3">${escapeHtml(t('checkout.total'))}</td><td class="num">${escapeHtml(formatCurrency(policy.importe))}</td></tr></tfoot>
        </table>
        <div class="signatures"><div>${escapeHtml(t('panel.capture.signMade'))}</div><div>${escapeHtml(t('panel.capture.signReceived'))}</div></div>`,
    });
};

// Contra recibo: las facturas que se reciben a revision, agrupadas por proveedor.
export const buildReviewHtml = (groups, t) => shell({
    t,
    title: t('panel.print.receipts'),
    meta: [`${escapeHtml(t('panel.print.issued'))} <b>${escapeHtml(formatDate(todayIso(), { day: '2-digit', month: 'long', year: 'numeric' }))}</b>`],
    body: groups.map((group, index) => {
        const due = group.invoices.map((i) => i.fecha_pago).filter(Boolean).sort().at(-1);
        return `<section class="section${index < groups.length - 1 ? ' page-break' : ''}">
            <div class="box"><div class="grid">
                ${field(t('panel.capture.provider'), escapeHtml(group.name))}
                ${field(t('panel.capture.totalToPay'), escapeHtml(formatCurrency(group.total)), 'amount')}
                ${field(t('panel.capture.scheduledPayment'), escapeHtml(formatDate(due)))}
                ${field(t('panel.capture.invoiceCount'), escapeHtml(group.invoices.length))}
            </div>
            <p class="words">${escapeHtml(t('panel.capture.amountInWords'))}: ${escapeHtml(amountInWords(group.total))}</p></div>
            <table>
                <thead><tr><th>${escapeHtml(t('panel.capture.invoice'))}</th><th>${escapeHtml(t('panel.capture.purchaseDate'))}</th><th>${escapeHtml(t('panel.capture.dueDate'))}</th><th class="num">${escapeHtml(t('panel.capture.amount'))}</th></tr></thead>
                <tbody>${group.invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.num_factura)}</td><td>${escapeHtml(formatDate(invoice.fecha_compra))}</td><td>${escapeHtml(formatDate(invoice.fecha_pago))}</td><td class="num">${escapeHtml(formatCurrency(invoice.total))}</td></tr>`).join('')}</tbody>
            </table>
            <div class="signatures"><div>${escapeHtml(t('panel.capture.signDelivered'))}</div><div>${escapeHtml(t('panel.capture.signReviewed'))}</div></div>
        </section>`;
    }).join(''),
});

// Pedido a un proveedor desde Faltantes. Los costos son los de la ultima compra.
export const buildOrderHtml = ({ provider, branch, items }, t) => {
    const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
    return shell({
        t,
        title: t('panel.missing.orderTitle'),
        meta: [
            `${escapeHtml(t('panel.print.issued'))} <b>${escapeHtml(formatDate(todayIso(), { day: '2-digit', month: 'long', year: 'numeric' }))}</b>`,
        ],
        body: `
        <div class="box"><div class="grid">
            ${field(t('panel.capture.provider'), escapeHtml(provider))}
            ${field(t('panel.missing.deliverTo'), escapeHtml(branch))}
        </div></div>
        <table>
            <thead><tr><th>#</th><th>${escapeHtml(t('panel.capture.part'))}</th><th>${escapeHtml(t('panel.capture.descriptionLabel'))}</th><th class="num">${escapeHtml(t('panel.capture.quantity'))}</th><th class="num">${escapeHtml(t('panel.missing.refCost'))}</th><th class="num">${escapeHtml(t('panel.capture.amount'))}</th></tr></thead>
            <tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td><b>${escapeHtml(item.row.num_parte)}</b></td><td>${escapeHtml(item.row.descripcion)}</td><td class="num">${escapeHtml(item.qty)}</td><td class="num">${escapeHtml(formatCurrency(item.cost))}</td><td class="num">${escapeHtml(formatCurrency(item.amount))}</td></tr>`).join('')}</tbody>
            <tfoot>
                <tr><td colspan="5">${escapeHtml(t('checkout.subtotal'))}</td><td class="num">${escapeHtml(formatCurrency(subtotal))}</td></tr>
                <tr><td colspan="5">${escapeHtml(t('panel.missing.withTax'))}</td><td class="num">${escapeHtml(formatCurrency(subtotal * 1.16))}</td></tr>
            </tfoot>
        </table>
        <p class="note">${escapeHtml(t('panel.missing.refCostNote'))}</p>`,
    });
};

// Abre una ventana con el documento y lanza la impresion. Sin `noopener`: con
// el, window.open devuelve null y parecia que el navegador la habia bloqueado.
export const printHtml = (html) => {
    if (typeof window === 'undefined') return false;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return false;
    printWindow.document.write(html);
    printWindow.document.close();
    const go = () => {
        printWindow.focus();
        printWindow.print();
    };
    if (printWindow.document.readyState === 'complete') setTimeout(go, 300);
    else printWindow.onload = go;
    return true;
};
