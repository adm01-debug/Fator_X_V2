/**
 * ClearChatDialog — confirmação temática (substitui window.confirm).
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClearChatDialogProps {
  open: boolean;
  agentName: string;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}

export function ClearChatDialog({ open, agentName, onOpenChange, onConfirm }: ClearChatDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
          <AlertDialogDescription>
            Toda a conversa com <strong>{agentName}</strong> será apagada permanentemente deste dispositivo.
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Limpar conversa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
