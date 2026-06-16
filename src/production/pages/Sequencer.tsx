// Sequencer page — full standalone view at /production/sequencer/:tab
// Thin wrapper around <SequencerBody />.

import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import { Button } from '../../components/ui';
import { PageHeader } from '../components/table';
import {
  SequencerBody, SEQUENCER_TABS, type SequencerTab,
} from '../components/SequencerBody';

export function Sequencer() {
  const { tab } = useParams<{ tab?: string }>();
  const active = (SEQUENCER_TABS.find(t => t.k === tab)?.k || 'mould') as SequencerTab;
  const navigate = useNavigate();
  const data = useProductionData();
  const activeTab = SEQUENCER_TABS.find(t => t.k === active);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module={`Production · Sequencer · ${activeTab?.label || ''}`}
        title="Sequencer"
        accent={activeTab?.label || ''}
        subtitle="Five production stages plus shift briefing — drag jobs through to dispatch."
        actions={
          <Link to="/production/jobs/new">
            <Button variant="primary" className="gap-2">
              <Plus size={14} className="stroke-2" /> New Job
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <SequencerBody
          data={data}
          activeTab={active}
          onTabChange={(t) => navigate(`/production/sequencer/${t}`)}
        />
      </div>
    </div>
  );
}
