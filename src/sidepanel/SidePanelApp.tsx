import { useState } from 'react';
import type { JobPosting } from '../shared/models/JobPosting';
import type { FieldMapping } from '../shared/models/FieldMapping';

export function SidePanelApp() {
  const [job, setJob] = useState<JobPosting | undefined>();
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [verification, setVerification] = useState<string>('No manual verification detected.');
  const [notes, setNotes] = useState('');

  async function analyzeJob() {
    const result = await chrome.runtime.sendMessage({ command: 'ANALYZE_CURRENT_JOB_PAGE' });
    setJob(result.response?.job);
    setVerification(
      result.response?.verification?.detected
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
  }

  async function analyzeFields() {
    const result = await chrome.runtime.sendMessage({ command: 'ANALYZE_APPLICATION_FIELDS' });
    setMappings(result.response?.mappings ?? []);
    setVerification(
      result.response?.verification?.detected
        ? 'Manual verification required.'
        : 'No manual verification detected.'
    );
  }

  return (
    <main className="app stack">
      <section className="hero">
        <span className="pill">Review-first workflow</span>
        <h1>Rapid Robot Job Assistant</h1>
        <div className="row">
          <button onClick={analyzeJob}>Analyze Job Page</button>
          <button className="secondary" onClick={analyzeFields}>
            Analyze Fields
          </button>
        </div>
      </section>

      <section className="grid two">
        <Card title="Job Summary">
          <p>{job?.title ?? 'No job analyzed yet.'}</p>
          <p className="muted">
            {[job?.company, job?.location, job?.remoteStatus].filter(Boolean).join(' | ')}
          </p>
        </Card>
        <Card title="Resume/Profile Match">
          <p className="muted">Local matching appears here after a profile and job are saved.</p>
        </Card>
        <Card title="Tailoring Suggestions">
          <p className="muted">Suggestions must be accepted, edited, or rejected by the user.</p>
        </Card>
        <Card title="Field Mapping">
          <p>
            {mappings.length ? `${mappings.length} fields detected.` : 'No fields analyzed yet.'}
          </p>
          {mappings.slice(0, 8).map((mapping) => (
            <p key={mapping.candidate.selector} className={mapping.sensitive ? 'warn' : 'muted'}>
              {mapping.kind} | {Math.round(mapping.confidence * 100)}% |{' '}
              {mapping.warning ?? 'Ready for review'}
            </p>
          ))}
        </Card>
        <Card title="Fill Preview">
          <p className="muted">
            Only approved fields are filled. File uploads and sensitive fields stay
            manual/review-first.
          </p>
        </Card>
        <Card title="Manual Verification Status">
          <p className={verification.includes('required') ? 'warn' : 'ok'}>{verification}</p>
        </Card>
      </section>

      <section className="card stack">
        <h2>Application Notes</h2>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Private local notes for this application."
        />
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
