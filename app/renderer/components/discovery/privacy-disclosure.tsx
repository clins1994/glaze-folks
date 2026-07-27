// First-use privacy disclosure. Honest about what is and isn't shared: only
// AI-derived topic labels leave this Mac (for matching); the transcript never
// does, and conversation/discovery data are temporary. Acknowledge-only — there
// is no dismiss path, so the message is always seen once.

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@glaze/core/components";

export function PrivacyDisclosure({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  return (
    <Dialog open={open}>
      <DialogContent size="small">
        <DialogHeader>
          <DialogTitle>Before you start</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Text variant="regular" color="secondary">
              While Folks is open, AI-generated topic labels may be shared for matching. Your messages
              are not shared.
            </Text>
            <Text variant="small" color="tertiary">
              Your conversation stays on this Mac and isn't saved. Topics and matches are temporary and
              fade when you go quiet. Folks keeps no profiles, friends, or history.
            </Text>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="accent" onClick={onAccept}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
