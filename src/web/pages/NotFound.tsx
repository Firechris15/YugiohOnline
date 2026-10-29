import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { CardBack } from '../components/Card';

export default function NotFoundPage() {
  const t = useT();
  return (
    <div className="page page-narrow center" style={{ paddingTop: 140 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, transform: 'rotate(-8deg)' }}>
        <CardBack size="md" />
      </div>
      <h1>404 – {t('common.notFound')}</h1>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>
        {t('common.toHome')}
      </Link>
    </div>
  );
}
