import { existsSync } from "node:fs";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { usePaste } from "@mbears/opentui-react";
import { decodePasteBytes, type PasteEvent } from "@mbears/opentui-core";
import {
  createImageDraftAttachment,
  readImageFileAsDataUrl,
} from "./app-image-files.js";
import type { PromptInputEditor } from "./app-input-pane.js";
import type { DraftAttachment } from "./app-model.js";
import { MAX_IMAGE_FILE_BYTES, tryParseImagePathPaste } from "./image-path.js";

export const OPEN_IMAGE_SHORTCUT_HINT = "Ctrl+O open last image";

type UseImagePathPasteOptions = {
  busy: boolean;
  cwd?: string;
  getDraftValue: () => string;
  inputEditorRef: MutableRefObject<PromptInputEditor | null>;
  nextAttachmentIdRef: MutableRefObject<number>;
  setDraftAttachments: Dispatch<SetStateAction<DraftAttachment[]>>;
  setDraftValue: (value: string) => void;
  setStatus: Dispatch<SetStateAction<string>>;
  setStatusDetails: Dispatch<SetStateAction<string[]>>;
};

export function useImagePathPaste({
  busy,
  cwd,
  getDraftValue,
  inputEditorRef,
  nextAttachmentIdRef,
  setDraftAttachments,
  setDraftValue,
  setStatus,
  setStatusDetails,
}: UseImagePathPasteOptions): void {
  const handlePaste = useCallback(
    (event: PasteEvent) => {
      if (busy) return;
      const text = decodePasteBytes(event.bytes);
      const paths = tryParseImagePathPaste(text, { cwd, existsSync });
      if (!paths) return;

      event.preventDefault();
      event.stopPropagation();
      void attachImagePaths(paths, {
        getDraftValue,
        inputEditorRef,
        nextAttachmentIdRef,
        setDraftAttachments,
        setDraftValue,
        setStatus,
        setStatusDetails,
      });
    },
    [
      busy,
      cwd,
      getDraftValue,
      inputEditorRef,
      nextAttachmentIdRef,
      setDraftAttachments,
      setDraftValue,
      setStatus,
      setStatusDetails,
    ],
  );

  usePaste(handlePaste);
}

async function attachImagePaths(
  paths: string[],
  options: Omit<UseImagePathPasteOptions, "busy">,
): Promise<void> {
  const attached: string[] = [];
  const errors: string[] = [];

  for (const path of paths) {
    const read = await readImageFileAsDataUrl(path, { maxBytes: MAX_IMAGE_FILE_BYTES });
    if (!read.ok) {
      errors.push(
        read.reason === "too_large"
          ? `Image too large (>20MB): ${path}`
          : `Could not read image: ${path}`,
      );
      continue;
    }
    const id = options.nextAttachmentIdRef.current++;
    const placeholder = `[image #${id}]`;
    const attachment = createImageDraftAttachment({
      ...read.attachment,
      id,
      placeholder,
    });
    options.setDraftAttachments((current) => [...current, attachment]);
    const next =
      insertPlaceholderIntoEditor(options.inputEditorRef.current, placeholder) ??
      appendedImagePlaceholder(options.getDraftValue(), placeholder);
    options.setDraftValue(next);
    attached.push(placeholder);
  }

  if (attached.length > 0) {
    options.setStatus(
      attached.length === 1
        ? `Attached ${attached[0]}. ${OPEN_IMAGE_SHORTCUT_HINT}`
        : `Attached ${attached.length} images. ${OPEN_IMAGE_SHORTCUT_HINT}`,
    );
  }
  if (errors.length > 0) {
    if (attached.length === 0) options.setStatus(errors[0]!);
    options.setStatusDetails(errors);
  }
}

function appendedImagePlaceholder(draft: string, placeholder: string): string {
  const trimmed = draft.trimEnd();
  return trimmed ? `${trimmed} ${placeholder}` : placeholder;
}

function insertPlaceholderIntoEditor(
  editor: PromptInputEditor | null,
  placeholder: string,
): string | undefined {
  if (!editor) return undefined;
  const next = appendedImagePlaceholder(editor.plainText, placeholder);
  editor.setText(next);
  editor.gotoBufferEnd();
  return next;
}
