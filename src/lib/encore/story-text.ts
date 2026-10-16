export type StorySegment = { t: string; src?: string };

/** Highlight exact substrings without ever removing text between them. */
export function storySegments(body: string, claims: string[]): StorySegment[] {
  const out: StorySegment[] = [];
  let offset = 0;
  const usable = claims.filter((c) => c.length > 0);
  while (offset < body.length) {
    const hit = usable.map((c) => ({ c, i: body.indexOf(c, offset) }))
      .filter((h) => h.i >= offset).sort((a, b) => a.i - b.i || b.c.length - a.c.length)[0];
    if (!hit) { out.push({ t: body.slice(offset) }); break; }
    if (hit.i > offset) out.push({ t: body.slice(offset, hit.i) });
    out.push({ t: hit.c, src: `Verified claim ${out.filter((s) => s.src).length + 1}` });
    offset = hit.i + hit.c.length;
  }
  return out;
}

export function typedStorySegments(segments: StorySegment[], characters: number): StorySegment[] {
  let left = Math.max(0, Math.floor(characters));
  return segments.flatMap((segment) => {
    const t = segment.t.slice(0, left);
    left = Math.max(0, left - segment.t.length);
    return t ? [{ t, ...(t.length === segment.t.length && segment.src ? { src: segment.src } : {}) }] : [];
  });
}