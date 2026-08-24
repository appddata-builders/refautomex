import React from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

const ListToPrint = React.forwardRef(({ items }, ref) => {
    const { t } = useTranslation();
    const multimediaSrc = process.env.NEXT_PUBLIC_S3;
    const logoUrl = `${multimediaSrc}refautomex_n.svg`;

    return (
        <div ref={ref} className="bg-white p-4 max-w-[255px] mx-auto text-sm text-gray-700">
            <div className="my-2 border-t border-b border-slate-300">
                <img src={logoUrl} alt={t('alt.logo')} className="h-14 mx-auto" />
                <table className="table-fixed w-full text-xs text-left px-0.5">
                    <thead>
                        <tr>
                            <th className="w-1/4 p-0.5 border-b text-[9px]">{t('panel.listPrint.part')}</th>
                            <th className="w-1/4 p-0.5 border-b text-[9px]">{t('panel.table.quantity')}</th>
                            <th className="w-2/4 p-0.5 border-b text-left text-[9px]">{t('panel.listPrint.location')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index} className="border-b">
                                <td className="p-0.5 text-[9px] truncate">{item.refaccion}</td>
                                <td className="p-0.5 text-[9px] text-left">{item.cantidad}</td>
                                <td className="p-0.5 text-[9px] truncate uppercase">{item.localizacion}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default ListToPrint;
