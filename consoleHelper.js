export const consoleHelper = (title ,message = '') => {
    if(process.env.NODE_ENV === 'development') {
        console.log('\n\n-----------|', title, '|-----------\n', message, '\n')
    }
}