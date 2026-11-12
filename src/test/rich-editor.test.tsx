import { render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { describe, expect, it, vi } from 'vitest';
import { RichEditor } from '@/components/knowledge/RichEditor';

const documentWith = (text: string) => ({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text }] },
] });

describe('contrato do editor com as extensões TipTap instaladas', () => {
  it('renderiza JSON existente e acompanha atualização controlada', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RichEditor value={documentWith('Conteúdo inicial')} onChange={onChange} editable={false} />);
    expect(await screen.findByText('Conteúdo inicial')).toBeInTheDocument();
    rerender(<RichEditor value={documentWith('Conteúdo atualizado')} onChange={onChange} editable={false} />);
    expect(await screen.findByText('Conteúdo atualizado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('preserva comandos de formatação, listas e histórico no mesmo núcleo', () => {
    const editor = new Editor({
      extensions: [StarterKit, Image, TaskList, TaskItem.configure({ nested: true })],
      content: documentWith('Texto de exemplo'),
    });
    try {
      expect(editor.chain().toggleBold().run()).toBe(true);
      expect(editor.isActive('bold')).toBe(true);
      editor.commands.toggleBold();
      expect(editor.chain().toggleItalic().run()).toBe(true);
      expect(editor.isActive('italic')).toBe(true);
      editor.commands.toggleItalic();
      expect(editor.chain().toggleStrike().run()).toBe(true);
      expect(editor.isActive('strike')).toBe(true);
      editor.commands.toggleStrike();
      expect(editor.chain().toggleCode().run()).toBe(true);
      expect(editor.isActive('code')).toBe(true);
      editor.commands.toggleCode();
      for (const level of [1, 2, 3] satisfies Array<1 | 2 | 3>) {
        expect(editor.chain().toggleHeading({ level }).run()).toBe(true);
        expect(editor.isActive('heading', { level })).toBe(true);
        editor.commands.setParagraph();
      }
      expect(editor.chain().toggleBulletList().run()).toBe(true);
      expect(editor.isActive('bulletList')).toBe(true);
      expect(editor.chain().toggleOrderedList().run()).toBe(true);
      expect(editor.isActive('orderedList')).toBe(true);
      editor.commands.toggleOrderedList();
      expect(editor.chain().toggleTaskList().run()).toBe(true);
      expect(editor.isActive('taskList')).toBe(true);
      editor.commands.toggleTaskList();
      expect(editor.chain().toggleBlockquote().run()).toBe(true);
      expect(editor.isActive('blockquote')).toBe(true);
      editor.commands.toggleBlockquote();
      expect(editor.chain().undo().run()).toBe(true);
      expect(editor.chain().redo().run()).toBe(true);
    } finally { editor.destroy(); }
  });
});
