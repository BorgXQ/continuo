import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

type Destination = { id: string; before: boolean };

export function usePlayingDrag(expanded: boolean, move: (source: string, target: string, before: boolean) => void) {
  const list = useRef<HTMLDivElement>(null);
  const source = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const destinationRef = useRef<Destination | null>(null);

  function locate() {
    const container = list.current;
    const point = pointer.current;
    let next: Destination | null = null;
    if (container && point) {
      const box = container.getBoundingClientRect();
      if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) {
        const rows = [...container.querySelectorAll<HTMLElement>('[data-playing-id]')];
        const row = rows.find(row => point.y < row.getBoundingClientRect().bottom) ?? rows.at(-1);
        if (row) {
          const bounds = row.getBoundingClientRect();
          next = { id: row.dataset.playingId!, before: point.y < bounds.top + bounds.height / 2 };
        }
      }
    }
    if (next?.id !== destinationRef.current?.id || next?.before !== destinationRef.current?.before) {
      destinationRef.current = next;
      setDestination(next);
    }
    return next;
  }

  function end() {
    source.current = null;
    pointer.current = null;
    destinationRef.current = null;
    setDragging(null);
    setDestination(null);
  }

  useEffect(() => {
    if (!dragging || !expanded) return;
    let frame = 0;
    let previous = performance.now();
    function scroll(now: number) {
      const elapsed = Math.min(now - previous, 50);
      previous = now;
      const container = list.current;
      const point = pointer.current;
      if (container && point) {
        const box = container.getBoundingClientRect();
        if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom) {
          const edge = Math.min(48, box.height / 3);
          const speed = point.y < box.top + edge ? -(box.top + edge - point.y) / edge
            : point.y > box.bottom - edge ? (point.y - box.bottom + edge) / edge : 0;
          container.scrollTop += speed * elapsed * 0.6;
          locate();
        }
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    const trackPointer = (event: globalThis.DragEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('dragend', end);
    window.addEventListener('blur', end);
    document.addEventListener('dragover', trackPointer);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('dragend', end);
      window.removeEventListener('blur', end);
      document.removeEventListener('dragover', trackPointer);
    };
  }, [dragging, expanded]);

  return {
    list, dragging, destination,
    start(event: DragEvent<HTMLButtonElement>, id: string) {
      if (!expanded) { event.preventDefault(); return; }
      source.current = id;
      setDragging(id);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      const row = event.currentTarget.closest<HTMLElement>('[data-playing-id]');
      if (row) {
        const box = row.getBoundingClientRect();
        event.dataTransfer.setDragImage(row, event.clientX - box.left, event.clientY - box.top);
      }
    },
    end,
    over(event: DragEvent<HTMLDivElement>) {
      if (!source.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      pointer.current = { x: event.clientX, y: event.clientY };
      locate();
    },
    drop(event: DragEvent<HTMLDivElement>) {
      if (!source.current) return;
      event.preventDefault();
      pointer.current = { x: event.clientX, y: event.clientY };
      const target = locate();
      if (target) move(source.current, target.id, target.before);
      end();
    },
  };
}
