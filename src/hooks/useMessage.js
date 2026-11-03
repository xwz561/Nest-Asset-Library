import { useEffect, useMemo, useState } from "react";
import { createMessageController } from "../lib/message-controller.cjs";

export function useMessage() {
  const [message, setMessage] = useState("");
  const controller = useMemo(() => createMessageController(setMessage), []);
  useEffect(() => () => controller.dispose(), [controller]);
  return { message, showMessage: controller.show, clearMessageAfter: controller.clearAfter };
}
