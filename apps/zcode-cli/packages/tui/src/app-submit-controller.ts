import React from "react";
import type { ModelSelection } from "@zcode/shared";
import type { SessionEvent, TurnId } from "@zcode/contracts";
import { resolveImageAttachmentsForSubmit } from "./app-image-files.js";
import { submitDuringActiveTurn, submitIdleTurn } from "./app-submit.js";
import type {
  DraftAttachment,
  Message,
  QueuedInput,
  SelectionState,
  SubmitValueOptions,
  SlashSelectionState,
} from "./app-model.js";
import { isQuitSlashCommand } from "./app-submit-resolver.js";
import type { TuiOptions, TuiRequestPermission, TuiSubmitPromptResult } from "./types.js";

export function useSubmitValue(input: {
  activeTurnId?: TurnId;
  applyResult: (result: TuiSubmitPromptResult, preserveTurnState?: boolean) => void;
  applySessionEvent: (event: SessionEvent) => void;
  busy: boolean;
  draftAttachmentsRef: React.MutableRefObject<DraftAttachment[]>;
  emptyPromptStatus: string;
  messageInsertIndex: number;
  options: TuiOptions;
  requestPermission: TuiRequestPermission;
  resolveSubmittedText: (submittedValue: string) => string;
  resolveSubmittedModel?: (submittedValue: string) => ModelSelection | undefined;
  setBusy: (value: boolean) => void;
  setDraftAttachments: React.Dispatch<React.SetStateAction<DraftAttachment[]>>;
  setDraftValue: (value: string) => void;
  setLastError: (message: string | undefined) => void;
  setLiveModelText: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setQueuedInputs: React.Dispatch<React.SetStateAction<QueuedInput[]>>;
  setSelection: React.Dispatch<React.SetStateAction<SelectionState | undefined>>;
  setSlashSelection: React.Dispatch<React.SetStateAction<SlashSelectionState | undefined>>;
  setStatus: (status: string) => void;
  setStatusDetails: React.Dispatch<React.SetStateAction<string[]>>;
  turnRef: React.MutableRefObject<AbortController | undefined>;
  onExit: (code: number) => void;
}): (submittedValue: string, options?: SubmitValueOptions) => Promise<void> {
  return React.useCallback(
    async (submittedValue: string, options: SubmitValueOptions = {}) => {
      const text = input.resolveSubmittedText(submittedValue).trim();
      const modelSelection = input.resolveSubmittedModel?.(submittedValue);
      if (!text) {
        input.setStatus(input.emptyPromptStatus);
        return;
      }
      if (isQuitSlashCommand(text)) {
        input.setDraftValue("");
        input.setDraftAttachments([]);
        input.onExit(0);
        return;
      }

      let nextId =
        input.draftAttachmentsRef.current.reduce(
          (maxId, attachment) => Math.max(maxId, attachment.id),
          0,
        ) + 1;
      const resolved = await resolveImageAttachmentsForSubmit({
        allocateId: () => nextId++,
        attachments: input.draftAttachmentsRef.current,
        cwd: input.options.workspaceDirectory,
        text,
      });
      if (resolved.errors.length > 0) {
        input.setStatus(resolved.errors[0]!);
        input.setStatusDetails(resolved.errors);
        if (resolved.errors.some((error) => error.includes("too large"))) {
          return;
        }
      }
      const draftAttachments = resolved.attachments;

      if (input.busy) {
        await submitDuringActiveTurn({
          activeTurnId: input.activeTurnId,
          applyResult: input.applyResult,
          applySessionEvent: input.applySessionEvent,
          draftAttachments,
          messageInsertIndex: input.messageInsertIndex,
          options: input.options,
          requestPermission: input.requestPermission,
          setDraftValue: input.setDraftValue,
          setLastError: input.setLastError,
          setMessages: input.setMessages,
          setQueuedInputs: input.setQueuedInputs,
          setStatus: input.setStatus,
          signal: input.turnRef.current?.signal,
          text,
          modelSelection,
        });
        return;
      }

      await submitIdleTurn({
        applyResult: input.applyResult,
        applySessionEvent: input.applySessionEvent,
        draftAttachments,
        options: input.options,
        requestPermission: input.requestPermission,
        setBusy: input.setBusy,
        setDraftAttachments: input.setDraftAttachments,
        setDraftValue: input.setDraftValue,
        setLastError: input.setLastError,
        setLiveModelText: input.setLiveModelText,
        setMessages: input.setMessages,
        setSelection: input.setSelection,
        setSlashSelection: input.setSlashSelection,
        setStatus: input.setStatus,
        setStatusDetails: input.setStatusDetails,
        submitOptions: options,
        text,
        modelSelection,
        turnRef: input.turnRef,
      });
    },
    [input],
  );
}
