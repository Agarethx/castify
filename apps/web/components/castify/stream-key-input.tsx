'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CopyButton } from './copy-button';

interface StreamKeyInputProps {
  value: string;
}

export function StreamKeyInput({ value }: StreamKeyInputProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={visible ? value : '•'.repeat(Math.min(value.length, 36))}
        className="font-mono text-xs bg-muted border-border"
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        title={visible ? 'Ocultar' : 'Mostrar'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}
