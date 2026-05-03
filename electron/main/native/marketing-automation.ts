import { app } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const LANDING_PROJECT_PATH = 'C:\\Users\\leonard\\Documents\\leonard\\leonardo-castillo';
const AUTO_BLOGGER_PATH = path.join(LANDING_PROJECT_PATH, 'scripts', 'auto-blogger.js');
const BLOG_CONTENT_DIR = path.join(LANDING_PROJECT_PATH, 'src', 'content', 'blog');
const SITE_BASE_URL = 'https://leonardocastillo.cl';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
const IMAGE_MODEL_FALLBACKS = ['gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'];
const TEXT_MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const MARKETING_CONFIG_FILE = 'marketing-ai.json';
const MARKETING_ASSETS_DIR = 'marketing-assets';

export interface MarketingBlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  tag: string;
  filePath: string;
  url: string;
  excerpt: string;
  updatedAt: string;
}

export interface MarketingAutomationRunResult {
  post: MarketingBlogPost | null;
  stdout: string;
  stderr: string;
}

export interface MarketingAIConfigStatus {
  isConfigured: boolean;
  hasApiKey: boolean;
  imageModel: string;
  textModel: string;
  assetsDir: string;
  keyPreview: string | null;
}

export interface MarketingGeneratedIdea {
  id: string;
  title: string;
  hook: string;
  summary: string;
  channel: 'linkedin' | 'website' | 'multi';
  angle: string;
  cta: string;
  imagePrompt: string;
  linkedinDraft: string;
  websiteDraft: string;
  sourceSlug?: string;
}

export interface MarketingGenerateIdeasParams {
  brief?: string;
  selectedPostSlug?: string;
  count?: number;
  channel?: 'linkedin' | 'website' | 'multi';
}

export interface MarketingGenerateImageParams {
  prompt: string;
  channel?: 'linkedin' | 'website-hero' | 'website-inline';
  title?: string;
}

export interface MarketingGeneratedImageResult {
  filePath: string;
  dataUrl: string;
  mimeType: string;
  prompt: string;
  channel: 'linkedin' | 'website-hero' | 'website-inline';
  width: number;
  height: number;
  createdAt: string;
}

interface Frontmatter {
  title?: string;
  description?: string;
  date?: string;
  readingTime?: string;
  tag?: string;
}

interface MarketingAIConfig {
  geminiApiKey?: string;
  imageModel?: string;
  textModel?: string;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, rawFrontmatter, body] = match;
  const frontmatter: Frontmatter = {};

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim() as keyof Frontmatter;
    const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, '$1');
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function buildPostFromFile(filePath: string): MarketingBlogPost {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const slug = path.basename(filePath, '.md');
  const stats = fs.statSync(filePath);
  const excerpt = body
    .replace(/[#>*`_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return {
    slug,
    title: frontmatter.title || slug,
    description: frontmatter.description || excerpt,
    date: frontmatter.date || '',
    readingTime: frontmatter.readingTime || '',
    tag: frontmatter.tag || '',
    filePath,
    url: `${SITE_BASE_URL}/blog/${slug}`,
    excerpt,
    updatedAt: stats.mtime.toISOString()
  };
}

function getLatestBlogFilePath(): string | null {
  if (!fs.existsSync(BLOG_CONTENT_DIR)) {
    return null;
  }

  const files = fs.readdirSync(BLOG_CONTENT_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.join(BLOG_CONTENT_DIR, file))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return files[0] ?? null;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

function buildId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getImageDimensions(channel: 'linkedin' | 'website-hero' | 'website-inline'): { width: number; height: number } {
  if (channel === 'website-hero') {
    return { width: 1600, height: 900 };
  }

  if (channel === 'website-inline') {
    return { width: 1400, height: 1050 };
  }

  return { width: 1200, height: 1200 };
}

export class MarketingAutomationManager {
  private readonly configPath: string;
  private readonly assetsDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, MARKETING_CONFIG_FILE);
    this.assetsDir = path.join(userDataPath, MARKETING_ASSETS_DIR);
    fs.mkdirSync(this.assetsDir, { recursive: true });
  }

  async runAutoBlogger(): Promise<MarketingAutomationRunResult> {
    if (!fs.existsSync(AUTO_BLOGGER_PATH)) {
      throw new Error(`Auto-blogger script not found: ${AUTO_BLOGGER_PATH}`);
    }

    return new Promise((resolve, reject) => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      const child = spawn('node', [AUTO_BLOGGER_PATH], {
        cwd: LANDING_PROJECT_PATH,
        shell: false,
        windowsHide: true,
        env: process.env
      });

      child.stdout.on('data', (data) => {
        stdoutChunks.push(data.toString());
      });

      child.stderr.on('data', (data) => {
        stderrChunks.push(data.toString());
      });

      child.once('error', (error) => {
        reject(error);
      });

      child.once('close', (code) => {
        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');

        if (code !== 0) {
          reject(new Error(stderr || stdout || `Auto-blogger exited with code ${code}`));
          return;
        }

        const latestFile = getLatestBlogFilePath();
        resolve({
          post: latestFile ? buildPostFromFile(latestFile) : null,
          stdout,
          stderr
        });
      });
    });
  }

  listRecentBlogPosts(limit = 8): MarketingBlogPost[] {
    if (!fs.existsSync(BLOG_CONTENT_DIR)) {
      return [];
    }

    return fs.readdirSync(BLOG_CONTENT_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(BLOG_CONTENT_DIR, file))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
      .slice(0, limit)
      .map((filePath) => buildPostFromFile(filePath));
  }

  getAIConfigStatus(): MarketingAIConfigStatus {
    const config = this.readConfig();
    const apiKey = this.getApiKey(config);

    return {
      isConfigured: Boolean(apiKey),
      hasApiKey: Boolean(apiKey),
      imageModel: config.imageModel || DEFAULT_IMAGE_MODEL,
      textModel: config.textModel || DEFAULT_TEXT_MODEL,
      assetsDir: this.assetsDir,
      keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : null
    };
  }

  saveGeminiApiKey(apiKey: string): MarketingAIConfigStatus {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error('Gemini API key is required');
    }

    const config = this.readConfig();
    config.geminiApiKey = trimmed;
    this.writeConfig(config);
    return this.getAIConfigStatus();
  }

  async generatePostIdeas(params: MarketingGenerateIdeasParams): Promise<MarketingGeneratedIdea[]> {
    const config = this.readConfig();
    const posts = this.listRecentBlogPosts(6);
    const selectedPost = params.selectedPostSlug
      ? posts.find((post) => post.slug === params.selectedPostSlug) ?? null
      : posts[0] ?? null;

    const promptPayload = {
      brief: params.brief?.trim() || '',
      selectedPost,
      recentPosts: posts.slice(0, 4).map((post) => ({
        slug: post.slug,
        title: post.title,
        description: post.description,
        url: post.url,
        tag: post.tag
      })),
      requestedCount: Math.min(Math.max(params.count ?? 5, 1), 8),
      channel: params.channel ?? 'multi'
    };

    const response = await this.callGeminiJsonWithFallback<{
      ideas: Array<{
        title?: string;
        hook?: string;
        summary?: string;
        channel?: 'linkedin' | 'website' | 'multi';
        angle?: string;
        cta?: string;
        imagePrompt?: string;
        linkedinDraft?: string;
        websiteDraft?: string;
      }>;
    }>(
      config.textModel || DEFAULT_TEXT_MODEL,
      [
        'You are a senior growth strategist for an AI-focused founder brand.',
        'Return JSON only.',
        'Generate sharp post concepts for LinkedIn and website promotion.',
        'Every idea must be usable immediately.',
        'Keep the voice direct, credible, technical, and founder-grade.',
        'Image prompts must produce premium visuals suitable for Gemini image generation.',
        'Output an object with an "ideas" array.'
      ].join(' '),
      promptPayload
    );

    const rawIdeas = Array.isArray(response.ideas) ? response.ideas : [];
    const fallbackPost = selectedPost ?? posts[0] ?? null;

    return rawIdeas.slice(0, promptPayload.requestedCount).map((idea, index) => ({
      id: buildId(`idea_${index}`),
      title: idea.title?.trim() || `Campaign idea ${index + 1}`,
      hook: idea.hook?.trim() || (fallbackPost ? `Why ${fallbackPost.title} matters now` : 'A strong AI and automation insight'),
      summary: idea.summary?.trim() || 'Clear point of view for a strong post.',
      channel: idea.channel || promptPayload.channel,
      angle: idea.angle?.trim() || 'Insight-led distribution',
      cta: idea.cta?.trim() || 'Read the full article and start the conversation.',
      imagePrompt: idea.imagePrompt?.trim() || this.buildDefaultImagePrompt(fallbackPost, promptPayload.channel),
      linkedinDraft: idea.linkedinDraft?.trim() || this.buildFallbackLinkedInDraft(fallbackPost, idea.title?.trim()),
      websiteDraft: idea.websiteDraft?.trim() || this.buildFallbackWebsiteDraft(fallbackPost, idea.title?.trim()),
      sourceSlug: selectedPost?.slug
    }));
  }

  async generateImage(params: MarketingGenerateImageParams): Promise<MarketingGeneratedImageResult> {
    const config = this.readConfig();
    const apiKey = this.getApiKey(config);
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    const channel = params.channel ?? 'linkedin';
    const dimensions = getImageDimensions(channel);
    const prompt = [
      params.prompt.trim(),
      '',
      `Render target: ${channel}.`,
      `Aspect target: ${dimensions.width}x${dimensions.height}.`,
      'Create a premium marketing visual with clean typography-safe composition, strong negative space, bold focal point, and no visible watermarks.',
      'Avoid clutter, distorted hands, unreadable text, or meme aesthetics.',
      'The image must feel polished enough for a founder brand, LinkedIn, and a high-end landing page.'
    ].join('\n');

    const result = await this.callGeminiImageWithFallback(config.imageModel || DEFAULT_IMAGE_MODEL, apiKey, prompt);
    const createdAt = new Date().toISOString();
    const fileSlug = slugify(params.title || channel);
    const extension = result.mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `${new Date().toISOString().slice(0, 10)}-${fileSlug}.${extension}`;
    const filePath = path.join(this.assetsDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));

    return {
      filePath,
      dataUrl: `data:${result.mimeType};base64,${result.data}`,
      mimeType: result.mimeType,
      prompt: params.prompt,
      channel,
      width: dimensions.width,
      height: dimensions.height,
      createdAt
    };
  }

  private readConfig(): MarketingAIConfig {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }

    return safeJsonParse<MarketingAIConfig>(fs.readFileSync(this.configPath, 'utf-8'), {});
  }

  private writeConfig(config: MarketingAIConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private getApiKey(config: MarketingAIConfig): string | null {
    return config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
  }

  private buildDefaultImagePrompt(post: MarketingBlogPost | null, channel: 'linkedin' | 'website' | 'multi'): string {
    const subject = post ? post.title : 'AI agents, automation, and modern growth systems';
    const channelContext = channel === 'website'
      ? 'website hero visual'
      : channel === 'linkedin'
        ? 'LinkedIn feed visual'
        : 'cross-channel campaign visual';

    return `Create a ${channelContext} about ${subject}. Style: editorial, cinematic, premium startup brand, bold composition, confident palette, subtle tech motifs, no text embedded in the image.`;
  }

  private buildFallbackLinkedInDraft(post: MarketingBlogPost | null, title?: string): string {
    if (!post) {
      return [
        `${title || 'A strong AI marketing angle'}:`,
        '',
        'The teams moving fastest right now are not just adding AI features.',
        'They are redesigning the way they create, distribute, and compound knowledge.',
        '',
        'That is where the real leverage starts.',
        '',
        '#AI #Automation #Agents #Growth'
      ].join('\n');
    }

    return [
      `${title || post.title}`,
      '',
      post.description || post.excerpt,
      '',
      'This is the kind of operating leverage that matters when you want distribution, execution, and product velocity to reinforce each other.',
      '',
      post.url,
      '',
      '#AI #Automation #Agents #Growth'
    ].join('\n');
  }

  private buildFallbackWebsiteDraft(post: MarketingBlogPost | null, title?: string): string {
    if (!post) {
      return `${title || 'New marketing campaign'}\n\nA direct founder-grade post designed to turn product insight into distribution.`;
    }

    return [
      title || post.title,
      '',
      post.description || post.excerpt,
      '',
      `Read more: ${post.url}`
    ].join('\n');
  }

  private async callGeminiJson<T>(model: string, systemPrompt: string, payload: unknown): Promise<T> {
    const config = this.readConfig();
    const apiKey = this.getApiKey(config);
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    const response = await this.callGeminiApi(model, apiKey, {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.9
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify(payload, null, 2)
            }
          ]
        }
      ]
    });

    const rawText = this.extractTextFromResponse(response);
    if (!rawText) {
      throw new Error('Gemini did not return text content');
    }

    return safeJsonParse<T>(stripCodeFence(rawText), {} as T);
  }

  private async callGeminiJsonWithFallback<T>(preferredModel: string, systemPrompt: string, payload: unknown): Promise<T> {
    const models = [preferredModel, ...TEXT_MODEL_FALLBACKS.filter((model) => model !== preferredModel)];
    let lastError: unknown = null;

    for (const model of models) {
      try {
        return await this.callGeminiJson<T>(model, systemPrompt, payload);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async callGeminiImage(model: string, apiKey: string, prompt: string): Promise<{ mimeType: string; data: string }> {
    const response = await this.callGeminiApi(model, apiKey, {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        if (part?.inlineData?.data && part?.inlineData?.mimeType) {
          return {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data
          };
        }
      }
    }

    const rawText = this.extractTextFromResponse(response);
    throw new Error(rawText || 'Gemini image generation did not return image data');
  }

  private async callGeminiImageWithFallback(preferredModel: string, apiKey: string, prompt: string): Promise<{ mimeType: string; data: string }> {
    const models = [preferredModel, ...IMAGE_MODEL_FALLBACKS.filter((model) => model !== preferredModel)];
    let lastError: unknown = null;

    for (const model of models) {
      try {
        return await this.callGeminiImage(model, apiKey, prompt);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private extractTextFromResponse(response: any): string {
    const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
    const texts: string[] = [];

    for (const candidate of candidates) {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      for (const part of parts) {
        if (typeof part?.text === 'string') {
          texts.push(part.text);
        }
      }
    }

    return texts.join('\n').trim();
  }

  private async callGeminiApi(model: string, apiKey: string, body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${GEMINI_API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const rawError = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${rawError}`);
    }

    return response.json();
  }
}
