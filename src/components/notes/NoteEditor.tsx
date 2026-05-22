import { useEditor, EditorContent, type Editor, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Bold, Italic, List, ListChecks, Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Palette, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

// Custom mark attribute to set inline font-size on TextStyle
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize || null,
            renderHTML: (attrs: any) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (size: string | null) => ({ chain }: any) =>
        size
          ? chain().setMark('textStyle', { fontSize: size }).run()
          : chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

export const FONT_SIZES = [
  { label: 'XS', value: '10px' },
  { label: 'S', value: '12px' },
  { label: 'M', value: '14px' },
  { label: 'L', value: '18px' },
  { label: 'XL', value: '24px' },
  { label: 'XXL', value: '32px' },
];


export const MARKER_COLORS = [
  { name: 'yellow', hex: 'hsl(50 95% 65% / 0.55)' },
  { name: 'pink', hex: 'hsl(330 80% 75% / 0.55)' },
  { name: 'blue', hex: 'hsl(210 90% 70% / 0.55)' },
  { name: 'green', hex: 'hsl(140 60% 65% / 0.55)' },
] as const;

export const TEXT_COLORS = [
  { name: 'black', hex: '#111827' },
  { name: 'red', hex: '#dc2626' },
  { name: 'blue', hex: '#2563eb' },
  { name: 'green', hex: '#16a34a' },
  { name: 'yellow', hex: '#ca8a04' },
  { name: 'gray', hex: '#6b7280' },
  { name: 'white', hex: '#ffffff' },
] as const;

interface Props {
  content: string;
  onUpdate: (html: string) => void;
  readOnly?: boolean;
  hideToolbar?: boolean;
  onEditorReady?: (editor: Editor | null) => void;
}

export function NoteEditor({ content, onUpdate, readOnly, hideToolbar, onEditorReady }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Notiz schreiben…' }),
      TextStyle,
      Color.configure({ types: ['textStyle'] }),
      FontSize,
      TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
    ],
    content: content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => onUpdate(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none text-foreground/90 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li_p]:m-0 min-h-[40px]',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    onEditorReady?.(editor);
    return () => { onEditorReady?.(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-1 h-full">
      {!readOnly && !hideToolbar && (
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
          <div className="w-px h-3 bg-foreground/20 mx-0.5" />
          <TextColorPicker editor={editor} />
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

export function FormattingToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 border-l border-border ml-0.5 pl-1">
      <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks className="h-3 w-3" /></ToolBtn>
      <div className="w-px h-3 bg-foreground/20 mx-0.5" />
      <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="h-3 w-3" /></ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="h-3 w-3" /></ToolBtn>
      <div className="w-px h-3 bg-foreground/20 mx-0.5" />
      <FontSizeSelect editor={editor} />
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
      <div className="w-px h-3 bg-foreground/20 mx-0.5" />
      <TextColorPicker editor={editor} />
    </div>
  );
}

function FontSizeSelect({ editor }: { editor: Editor }) {
  const current = (editor.getAttributes('textStyle') as any)?.fontSize || '';
  return (
    <div className="flex items-center gap-1">
      <Type className="h-3 w-3 text-foreground/60" />
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          (editor.chain().focus() as any).setFontSize(v || null).run();
        }}
        className="h-5 text-[10px] bg-transparent border border-border rounded-sm px-1 focus:outline-none cursor-pointer"
        title="Schriftgröße"
      >
        <option value="">Auto</option>
        {FONT_SIZES.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const current = editor.getAttributes('textStyle')?.color as string | undefined;
  return (
    <div className="relative">
      <ToolBtn active={!!current} onClick={() => setOpen(!open)}><Palette className="h-3 w-3" /></ToolBtn>
      {open && (
        <div className="absolute top-full left-0 mt-1 flex items-center gap-0.5 bg-popover border border-border rounded-md shadow-md p-1 z-50">
          {TEXT_COLORS.map(c => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                editor.chain().focus().setColor(c.hex).run();
                setOpen(false);
              }}
              title={c.name}
              className="h-4 w-4 rounded-full border border-foreground/20"
              style={{ background: c.hex }}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              editor.chain().focus().unsetColor().run();
              setOpen(false);
            }}
            title="Farbe entfernen"
            className="h-4 w-4 rounded-full border border-foreground/20 flex items-center justify-center text-foreground/60"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}


