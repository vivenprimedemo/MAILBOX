

export const inbox = (accountId, nextPage) =>  `EMAIL:INBOX:${accountId}:${nextPage}`;
export const folders = (accountId) => `EMAIL:FOLDERS:${accountId}`;