"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { rejectFormSchema, type RejectFormValues } from "@/shared/schemas/submission";

/**
 * Rejecting requires a reason (case 4.2). The rule comes from
 * `rejectionReasonSchema`, the same one `submission.reject` validates with and
 * the same one the `submission_rejected_needs_reason` CHECK backs up.
 */
export function RejectDialog({
  open,
  onOpenChange,
  submissionLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionLabel: string;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(rejectFormSchema),
    defaultValues: { reason: "" },
    mode: "onSubmit",
  });

  // A fresh dialog is a fresh reason; reopening must not reuse the last one.
  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this submission</DialogTitle>
          <DialogDescription>
            The creator sees this reason on their submissions list. It is required.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => onConfirm(values.reason))}
          >
            <p className="text-sm text-muted-foreground">
              Clip: <span className="break-all">{submissionLabel}</span>
            </p>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      autoFocus
                      placeholder="e.g. The product is not visible in the clip."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Rejecting…" : "Reject submission"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
