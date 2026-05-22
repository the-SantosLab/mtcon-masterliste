import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListChecks, Highlighter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

const MARKER_COLORS = [
  { name: 'yellow', hex: 'hsl(50 95% 65% / 0.55)' },
  { name: 'pink', hex: 'hsl(330 80% 75% / 0.55)' },
  { name: 'blue', hex: 'hsl(210 90% 70% / 0.55)' },
  { name: 'green', hex: 'hsl(140 60% 65% / 0.55)' },
];

interface Props {
  content: string;
  onUpdate: (html: string) => void;
  readOnly?: boolean;
}

export function NoteEditor({ content, onUpdate, readOnly }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Notiz schreiben…' }),
    ],
    content: content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none text-foreground/90 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li_p]:m-0 min-h-[80px]',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-1 h-full">
      {!readOnly && (
        <div className="flex items-center gap-0.5 border-b border-foreground/10 pb-1 mb-1 flex-wrap">
          <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3 w-3" /></ToolBtn>
          <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3 w-3" /></ToolBtn>
          <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3 w-3" /></ToolBtn>
          <ToolBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="h-3 w-3" /></ToolBtn>
          <div className="w-px h-3 bg-foreground/20 mx-0.5" />
          {MARKER_COLORS.map(c => (
            <button
              key={c.name}
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight({ color: c.hex }).run()}
              title={`Marker ${c.name}`}
              className="h-4 w-4 rounded-sm border border-foreground/20"
              style={{ background: c.hex }}
            />
          ))}
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            title="Marker entfernen"
            className="h-4 w-4 rounded-sm border border-foreground/20 flex items-center justify-center text-foreground/60"
          >
            <Highlighter className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
      <div className="flex-1 overflow-auto text-xs">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-5 w-5 flex items-center justify-center rounded-sm text-foreground/70 hover:text-foreground hover:bg-foreground/10',
        active && 'bg-foreground/15 text-foreground'
      )}
    >
      {children}
    </button>
  );
}
