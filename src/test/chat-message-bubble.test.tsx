import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '@/components/chat/MessageBubble';

describe('MessageBubble — sanitization', () => {
  it('não executa <script> em payload malicioso', () => {
    render(
      <MessageBubble
        message={{
          id: 'x',
          role: 'assistant',
          content: '<script>window.__pwn=1</script>Olá',
          timestamp: Date.now(),
        }}
      />,
    );
    // Script não deve ser executado
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
    // Texto legível permanece (skipHtml escapa a tag como texto)
    const { container } = screen.getByRole('article').parentElement
      ? { container: screen.getByRole('article') }
      : { container: document.body };
    expect(container.textContent ?? '').toContain('Olá');
    expect(container.querySelector('script')).toBeNull();
  });

  it('bloqueia <iframe>', () => {
    const { container } = render(
      <MessageBubble
        message={{
          id: 'y',
          role: 'assistant',
          content: '<iframe src="javascript:alert(1)"></iframe>texto',
          timestamp: Date.now(),
        }}
      />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renderiza mensagem falha com botão de retry', () => {
    render(
      <MessageBubble
        message={{ id: 'z', role: 'user', content: 'oi', timestamp: Date.now(), failed: true }}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByLabelText('Reenviar mensagem')).toBeInTheDocument();
    expect(screen.getByLabelText('Falha ao entregar')).toBeInTheDocument();
  });
});
