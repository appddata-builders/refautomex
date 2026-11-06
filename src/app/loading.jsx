import Spinner from '@/app/components/principal/spinner';

// Next lo pinta mientras llega la siguiente pagina al navegar entre rutas, y
// solo ese tiempo. Las pantallas que cambian con ?load= no navegan: se cambian
// al momento en el navegador y no lo muestran.
export default function Loading() {
  return <Spinner />;
}
