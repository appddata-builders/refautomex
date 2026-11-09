import React from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

const ListToPrint = React.forwardRef(({ items }, ref) => {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const logoUrl = `${multimediaSrc}refautomex_n.svg`;

    return (
        // Mismo ancho y margen que el ticket de venta (component-print): en un
        // rollo de 58 mm, a todo lo ancho, las orillas quedaban fuera de lo que
        // marca la impresora.
        <div ref={ref} className="bg-white p-4 max-w-[220px] mx-auto text-sm text-gray-700 print:w-[55mm] print:max-w-[55mm] print:text-black">
            <div className="my-2 border-t border-b border-slate-300">
                <img src={logoUrl} alt={t('alt.logo')} className="h-14 mx-auto" />
                <table className="table-fixed w-full text-xs text-left px-0.5">
                    <thead>
                        <tr>
                            {/* La cantidad es de 1 a 3 cifras: su columna es angosta
                                ("CANT", como en el ticket) y el espacio va a la parte. */}
                            <th className="w-5/12 p-0.5 border-b text-[9px]">{t('panel.listPrint.part')}</th>
                            <th className="w-2/12 p-0.5 border-b text-[9px]">{t('panel.print.qty')}</th>
                            <th className="w-5/12 p-0.5 border-b text-left text-[9px]">{t('panel.listPrint.location')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index} className="border-b">
                                {/* Se parten en vez de recortarse: con truncate, un número
                                    de parte largo salía como "PRUEBA01I…" y la lista ya no
                                    decía qué surtir. */}
                                <td className="p-0.5 text-[9px] break-all">{item.refaccion}</td>
                                <td className="p-0.5 text-[9px] text-left">{item.cantidad}</td>
                                <td className="p-0.5 text-[9px] break-all uppercase">{item.localizacion}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default ListToPrint;
