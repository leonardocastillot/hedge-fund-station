import React, { useEffect, useMemo, useState } from 'react';
import { linkedInService } from '@/services/linkedin';
import type {
  MarketingAIConfigStatus,
  MarketingBlogPost,
  MarketingGeneratedIdea,
  MarketingGeneratedImageResult
} from '@/types/electron';

type IdeaChannel = 'linkedin' | 'website' | 'multi';
type ImageChannel = 'linkedin' | 'website-hero' | 'website-inline';

interface SavedIdea extends MarketingGeneratedIdea {
  savedAt: number;
  origin: 'manual' | 'ai';
}

interface Notice {
  type: 'success' | 'error' | 'info';
  message: string;
}

const box: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.42)',
  border: '1px solid rgba(239, 68, 68, 0.14)',
  borderRadius: 14,
  padding: 16
};

const input: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0, 0, 0, 0.58)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 10,
  padding: '10px 12px',
  color: '#f3f4f6',
  fontSize: 13
};

const buttonPrimary: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer'
};

const buttonSecondary: React.CSSProperties = {
  ...buttonPrimary,
  background: 'rgba(239, 68, 68, 0.08)',
  border: '1px solid rgba(239, 68, 68, 0.18)',
  color: '#fca5a5'
};

function promoFromPost(post: MarketingBlogPost): string {
  return [
    `New article published: ${post.title}`,
    '',
    post.description || post.excerpt,
    '',
    post.url,
    '',
    '#AI #Automation #Agents #Growth'
  ].join('\n');
}

function loadSavedIdeas(): SavedIdea[] {
  const raw = localStorage.getItem('marketing_post_ideas');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<any>;
    return parsed.map((item) => ({
      id: item.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: item.title || (item.text || 'Manual idea').slice(0, 64),
      hook: item.hook || item.text || '',
      summary: item.summary || item.text || '',
      channel: (item.channel || 'multi') as IdeaChannel,
      angle: item.angle || 'Campaign angle',
      cta: item.cta || 'Turn this into a post.',
      imagePrompt: item.imagePrompt || '',
      linkedinDraft: item.linkedinDraft || item.text || '',
      websiteDraft: item.websiteDraft || item.text || '',
      sourceSlug: item.sourceSlug,
      savedAt: item.savedAt || item.timestamp || Date.now(),
      origin: item.origin || (item.title ? 'ai' : 'manual')
    }));
  } catch {
    return [];
  }
}

export const MarketingPanel: React.FC = () => {
  const [blogPosts, setBlogPosts] = useState<MarketingBlogPost[]>([]);
  const [selectedPostSlug, setSelectedPostSlug] = useState('');
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [aiStatus, setAiStatus] = useState<MarketingAIConfigStatus | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [ideaBrief, setIdeaBrief] = useState('');
  const [manualIdea, setManualIdea] = useState('');
  const [ideaChannel, setIdeaChannel] = useState<IdeaChannel>('multi');
  const [imageChannel, setImageChannel] = useState<ImageChannel>('linkedin');
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [generatedImage, setGeneratedImage] = useState<MarketingGeneratedImageResult | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [busy, setBusy] = useState<'none' | 'ideas' | 'image' | 'blog' | 'publish' | 'autopilot'>('none');

  const selectedPost = useMemo(
    () => blogPosts.find((post) => post.slug === selectedPostSlug) ?? blogPosts[0] ?? null,
    [blogPosts, selectedPostSlug]
  );
  const selectedIdea = useMemo(
    () => savedIdeas.find((idea) => idea.id === selectedIdeaId) ?? null,
    [savedIdeas, selectedIdeaId]
  );

  const persistIdeas = (ideas: SavedIdea[]) => {
    setSavedIdeas(ideas);
    localStorage.setItem('marketing_post_ideas', JSON.stringify(ideas));
  };

  const refresh = async () => {
    try {
      const [posts, config] = await Promise.all([
        window.electronAPI.marketing.listBlogPosts(8),
        window.electronAPI.marketing.getAIConfigStatus()
      ]);
      setBlogPosts(posts);
      setSelectedPostSlug((current) => current || posts[0]?.slug || '');
      setAiStatus(config);
      linkedInService.reloadCredentials();
      setAccessToken(linkedInService.getCredentials()?.accessToken || '');
    } catch (error) {
      setNotice({ type: 'error', message: `Could not load marketing data: ${String(error)}` });
    }
  };

  useEffect(() => {
    setSavedIdeas(loadSavedIdeas());
    void refresh();
  }, []);

  const saveApiKey = async () => {
    try {
      const config = await window.electronAPI.marketing.saveGeminiApiKey(geminiApiKey);
      setAiStatus(config);
      setGeminiApiKey('');
      setNotice({ type: 'success', message: 'Gemini API key saved locally.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Could not save Gemini API key: ${String(error)}` });
    }
  };

  const addManualIdea = () => {
    if (!manualIdea.trim()) return;
    const next: SavedIdea = {
      id: `manual_${Date.now()}`,
      title: manualIdea.slice(0, 64),
      hook: manualIdea,
      summary: manualIdea,
      channel: 'multi',
      angle: 'Manual note',
      cta: 'Turn this into a campaign.',
      imagePrompt: '',
      linkedinDraft: manualIdea,
      websiteDraft: manualIdea,
      savedAt: Date.now(),
      origin: 'manual'
    };
    persistIdeas([next, ...savedIdeas]);
    setSelectedIdeaId(next.id);
    setManualIdea('');
    setNotice({ type: 'success', message: 'Manual idea saved.' });
  };

  const generateIdeas = async (count = 5): Promise<SavedIdea[]> => {
    setBusy('ideas');
    try {
      const ideas = await window.electronAPI.marketing.generateIdeas({
        brief: ideaBrief || undefined,
        selectedPostSlug: selectedPost?.slug,
        count,
        channel: ideaChannel
      });
      const next = ideas.map((idea) => ({ ...idea, savedAt: Date.now(), origin: 'ai' as const }));
      persistIdeas([...next, ...savedIdeas]);
      setSelectedIdeaId(next[0]?.id ?? null);
      setNotice({ type: 'success', message: `${next.length} ideas generated.` });
      return next;
    } catch (error) {
      setNotice({ type: 'error', message: `Idea generation failed: ${String(error)}` });
      return [];
    } finally {
      setBusy('none');
    }
  };

  const generateImage = async (prompt: string, title: string) => {
    setBusy('image');
    try {
      const image = await window.electronAPI.marketing.generateImage({ prompt, title, channel: imageChannel });
      setGeneratedImage(image);
      setNotice({ type: 'success', message: 'Image generated and stored locally.' });
      return image;
    } catch (error) {
      setNotice({ type: 'error', message: `Image generation failed: ${String(error)}` });
      return null;
    } finally {
      setBusy('none');
    }
  };

  const autopilot = async () => {
    if (!selectedPost) {
      setNotice({ type: 'error', message: 'Select a source post first.' });
      return;
    }
    setBusy('autopilot');
    try {
      const generated = await generateIdeas(3);
      const latest = generated[0];
      if (!latest) {
        throw new Error('No idea was generated for the campaign.');
      }

      setSelectedIdeaId(latest.id);
      setDraft(latest.linkedinDraft || promoFromPost(selectedPost));
      setDraftLink(selectedPost.url);

      if (latest.imagePrompt) {
        await generateImage(latest.imagePrompt, latest.title);
      }

      if (autoPublish) {
        await publishLinkedIn(latest.linkedinDraft || promoFromPost(selectedPost), selectedPost.url);
        setNotice({ type: 'success', message: 'Campaign generated, image created, and post published.' });
        return;
      }

      setNotice({ type: 'success', message: 'Campaign generated. Review the draft and publish when ready.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Autopilot failed: ${String(error)}` });
    } finally {
      setBusy('none');
    }
  };

  const runAutoBlogger = async () => {
    setBusy('blog');
    try {
      await window.electronAPI.marketing.runAutoBlogger();
      await refresh();
      setNotice({ type: 'success', message: 'Auto-blogger completed.' });
    } catch (error) {
      setNotice({ type: 'error', message: `Auto-blogger failed: ${String(error)}` });
    } finally {
      setBusy('none');
    }
  };

  const publishLinkedIn = async (textArg?: string, linkArg?: string) => {
    setBusy('publish');
    try {
      if (accessToken.trim()) {
        linkedInService.setAccessToken(accessToken.trim());
      }
      const text = textArg ?? draft;
      const link = linkArg ?? draftLink;
      if (!text.trim()) {
        throw new Error('There is no draft to publish.');
      }
      await linkedInService.publishPost({ text, linkUrl: link || undefined });
      setNotice({ type: 'success', message: 'LinkedIn post published.' });
    } catch (error) {
      setNotice({ type: 'error', message: `LinkedIn publish failed: ${String(error)}` });
    } finally {
      setBusy('none');
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#05070b', color: '#f3f4f6', padding: 18, display: 'grid', gap: 16 }}>
      <div style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ef4444', fontSize: 20, fontWeight: 800 }}>Marketing Studio</div>
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Ideas, drafts and Nano Banana style image generation from one place.</div>
        </div>
        <div style={{ color: '#9ca3af', fontSize: 12 }}>
          AI: {aiStatus?.isConfigured ? aiStatus.imageModel : 'not configured'}<br />
          Assets: {aiStatus?.assetsDir || 'unavailable'}
        </div>
      </div>

      {notice && (
        <div
          style={{
            ...box,
            fontSize: 12,
            color: notice.type === 'error' ? '#fca5a5' : notice.type === 'info' ? '#cbd5e1' : '#4ade80',
            borderColor: notice.type === 'error' ? 'rgba(239, 68, 68, 0.28)' : 'rgba(34, 197, 94, 0.2)'
          }}
        >
          {notice.message}
        </div>
      )}

      <div style={{ ...box, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Settings</div>
        <input value={geminiApiKey} onChange={(event) => setGeminiApiKey(event.target.value)} placeholder="Gemini API key" type="password" style={input} />
        <input value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="LinkedIn access token" type="password" style={input} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void saveApiKey()} style={buttonPrimary}>Save Gemini key</button>
          <button onClick={() => void refresh()} style={buttonSecondary}>Refresh</button>
        </div>
      </div>

      <div style={{ ...box, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Campaign engine</div>
        <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>
          Fast flow:
          <br />
          1. Save Gemini key and LinkedIn token once.
          <br />
          2. Pick a source post.
          <br />
          3. Click Autopilot.
          <br />
          4. If auto-publish is on, it publishes after generating the image.
        </div>
        <textarea value={ideaBrief} onChange={(event) => setIdeaBrief(event.target.value)} placeholder="What do you want to push?" style={{ ...input, minHeight: 96 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px', gap: 8 }}>
          <select value={selectedPostSlug} onChange={(event) => setSelectedPostSlug(event.target.value)} style={input}>
            {blogPosts.map((post) => <option key={post.slug} value={post.slug}>{post.title}</option>)}
          </select>
          <select value={ideaChannel} onChange={(event) => setIdeaChannel(event.target.value as IdeaChannel)} style={input}>
            <option value="multi">multi</option>
            <option value="linkedin">linkedin</option>
            <option value="website">website</option>
          </select>
          <select value={imageChannel} onChange={(event) => setImageChannel(event.target.value as ImageChannel)} style={input}>
            <option value="linkedin">linkedin image</option>
            <option value="website-hero">website hero</option>
            <option value="website-inline">website inline</option>
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 12 }}>
          <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} />
          Auto-publish to LinkedIn after generating campaign
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => void generateIdeas()} style={buttonPrimary}>{busy === 'ideas' ? 'Generating...' : 'Generate ideas'}</button>
          <button onClick={() => void autopilot()} style={buttonSecondary}>{busy === 'autopilot' ? 'Running...' : 'Autopilot'}</button>
          <button onClick={() => void runAutoBlogger()} style={buttonSecondary}>{busy === 'blog' ? 'Running...' : 'Run auto-blogger'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
        <div style={{ ...box, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Ideas</div>
          <textarea value={manualIdea} onChange={(event) => setManualIdea(event.target.value)} placeholder="Save a manual idea" style={{ ...input, minHeight: 88 }} />
          <button onClick={addManualIdea} style={buttonSecondary}>Add manual idea</button>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {savedIdeas.map((idea) => (
              <div key={idea.id} onClick={() => setSelectedIdeaId(idea.id)} style={{ ...box, padding: 12, cursor: 'pointer', borderColor: selectedIdeaId === idea.id ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.14)' }}>
                <div style={{ fontWeight: 700 }}>{idea.title}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{idea.hook}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...box, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Inspector</div>
          {selectedIdea ? (
            <>
              <div>{selectedIdea.summary}</div>
              <textarea value={selectedIdea.imagePrompt || ''} readOnly style={{ ...input, minHeight: 120 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => { setDraft(selectedIdea.linkedinDraft); setDraftLink(selectedPost?.url || ''); }} style={buttonPrimary}>Use LinkedIn draft</button>
                <button onClick={() => { setDraft(selectedIdea.websiteDraft); setDraftLink(selectedPost?.url || ''); }} style={buttonSecondary}>Use website draft</button>
                <button onClick={() => void generateImage(selectedIdea.imagePrompt || selectedIdea.summary, selectedIdea.title)} style={buttonSecondary}>
                  {busy === 'image' ? 'Generating...' : 'Generate image'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>Pick an idea.</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ ...box, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Draft editor</div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} style={{ ...input, minHeight: 220 }} />
          <input value={draftLink} onChange={(event) => setDraftLink(event.target.value)} placeholder="Link" style={input} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void navigator.clipboard.writeText(draft)} style={buttonSecondary}>Copy draft</button>
            <button onClick={() => void publishLinkedIn()} style={buttonPrimary}>{busy === 'publish' ? 'Publishing...' : 'Publish LinkedIn'}</button>
            {selectedPost && <button onClick={() => { setDraft(promoFromPost(selectedPost)); setDraftLink(selectedPost.url); }} style={buttonSecondary}>Use selected post</button>}
          </div>
        </div>

        <div style={{ ...box, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Generated image</div>
          {generatedImage ? (
            <>
              <img src={generatedImage.dataUrl} alt="Generated marketing" style={{ width: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }} />
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{generatedImage.filePath}</div>
              <button onClick={() => void navigator.clipboard.writeText(generatedImage.filePath)} style={buttonSecondary}>Copy asset path</button>
            </>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>No image generated yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
