import { useEffect, useState } from 'react';
import type { CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api } from '../../services/api';

export function CatalogImage({ item }: { item: CatalogItem }) {
  const path = `/catalog/${item.id}/image`,
    key = `${path}:${item.rowVersion}`;
  const [loaded, setLoaded] = useState<{ key: string; image: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    if (item.hasImage)
      void api<{ image: string | null }>(path)
        .then((r) => {
          if (alive) setLoaded({ key, image: r.image });
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, key, item.hasImage]);
  const image = item.hasImage && loaded?.key === key ? loaded.image : null;
  return image ? <img src={image} alt={item.name} loading="lazy" /> : null;
}
