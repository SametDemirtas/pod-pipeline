import { useRef, useState } from 'react';
import type { SceneLookDto } from '@pod/contracts/client';
import { PLAIN_LOOK } from './SceneLook.js';
import type { DescribedStyle } from './StyleFromPhoto.js';

/** What the seller asks a scene for: its description, look and whether to make two. */
export function useSceneForm() {
  const [prompt, setPromptState] = useState('');
  // The description as typed by now, for a style that arrives after the request went out.
  const latestPrompt = useRef('');
  const [look, setLook] = useState<SceneLookDto>(PLAIN_LOOK);
  const [twoCandidates, setTwoCandidates] = useState(false);
  /** The described style, waiting while the seller decides whether it replaces theirs. */
  const [offered, setOffered] = useState<DescribedStyle | null>(null);

  const setPrompt = (text: string) => {
    latestPrompt.current = text;
    setPromptState(text);
  };
  /** The style replaces the description and the look options, keeping the chosen shape. */
  const take = (style: DescribedStyle) => {
    setPrompt(style.description);
    setLook((current) => ({ shape: current.shape, ...style.look }));
    setOffered(null);
  };

  return {
    prompt,
    setPrompt,
    look,
    setLook,
    twoCandidates,
    setTwoCandidates,
    offered,
    take,
    keep: () => {
      setOffered(null);
    },
    /** Takes a described style at once into an empty description, else asks first. */
    offer: (style: DescribedStyle) => {
      if (latestPrompt.current.trim()) setOffered(style);
      else take(style);
    },
    /** A dialog opened again starts without the earlier question or second scene. */
    restart: () => {
      setOffered(null);
      setTwoCandidates(false);
    },
  };
}
