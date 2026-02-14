export function getKstDate(daysOffset: number = 0) {
    const now = new Date();
    now.setDate(now.getDate() + daysOffset);

    const kstDateStr = now.toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Seoul',
    });

    return new Date(kstDateStr + 'T00:00:00.000Z');
}

export function getKstTimeNow() {
    const now = new Date();
    console.log(now);
    const kstStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
    return new Date(kstStr.replace(' ', 'T') + '.000Z');
}
