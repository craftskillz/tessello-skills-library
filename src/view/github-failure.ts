// What the View tells the User when GitHub gave nothing, for the URL pasted in the Library and for a refresh.

import type { GitHubFailure } from "../lib/github.ts";
import { type MessageKey, t } from "../lib/i18n.ts";

const MESSAGES: Record<GitHubFailure, MessageKey> = { not_found: "url_not_found", rate_limited: "rate_limited", network: "url_unreadable" };

/** Why GitHub gave nothing, in the language of the View. */
export const failureMessage = (failure: GitHubFailure) => t(MESSAGES[failure]);
