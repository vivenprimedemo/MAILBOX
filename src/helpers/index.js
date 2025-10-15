
export const inbox = (accountId, nextPage) =>  `EMAIL:INBOX:${accountId}:${nextPage || 'default'}`;
export const folders = (accountId) => `EMAIL:FOLDERS:${accountId}`;


// Get formatted date and time in local timezone Example: (2025-10-07 18:03:46)
export const getFormattedDateTime = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}