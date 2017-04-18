import { DebugProtocol } from 'vscode-debugprotocol';

export interface InteractiveRequestChuck {
    response: DebugProtocol.Response;
    command_id: string;
}

export const E2A_ISSUE_COMMAND    = "interactive.issueCommand";
export const E2A_REPLY_CHOICE     = "interactive.replyChoice";
export const A2E_SHOW_ERROR_MSG   = "interactive.showErrorMessage";
export const A2E_SHOW_INFO_MSG    = "interactive.showInformationMessage";
export const A2E_SHOW_WARN_MSG    = "interactive.showWarningMessage";
export const A2E_SHOW_QUICK_PICK  = "interactive.showQuickPick";
export const A2E_REPLY_COMMAND    = "interactive.replyCommand";
