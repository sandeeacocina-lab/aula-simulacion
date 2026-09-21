export type SepeView = 'services' | 'import' | 'history' | 'models';

export function sepeViewFromSearch(search: string): SepeView {
  const params = new URLSearchParams(search);
  if (params.get('modelos') === '1') return 'models';
  if (params.get('consulta') === '1') return 'history';
  if (params.get('envio') === '1') return 'import';
  return 'services';
}

export function sepeViewSearch(view: SepeView, search = '') {
  const params = new URLSearchParams(search);
  for (const key of ['envio', 'consulta', 'modelos']) params.delete(key);
  if (view !== 'services') params.set({import: 'envio', history: 'consulta', models: 'modelos'}[view], '1');
  const query = params.toString();
  return query ? '?' + query : '';
}

export const sepeViewTitles: Record<SepeView, string> = {
  services: 'Contratos',
  import: 'Comunicación de contratos · Contrat@',
  history: 'Consulta de comunicaciones',
  models: 'Modelos de contratos',
};
