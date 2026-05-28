'use client';
import { PasteViewer } from '../../../src/components/paste/PasteViewer';
import { use } from 'react';

export default function ViewerPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  return (
    <div className="flex flex-col items-center pt-8 pb-24 w-full">
      <PasteViewer id={params.id} />
    </div>
  );
}
