document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const exportBtn = document.getElementById('exportBtn');
    const statusSpan = document.getElementById('status');
    const countSpan = document.getElementById('count');
    const modeInputs = document.getElementsByName('mode');
    const pageCountDiv = document.getElementById('pageCount');

    // 切换采集模式
    modeInputs.forEach(input => {
        input.addEventListener('change', function() {
            pageCountDiv.style.display = 
                this.value === 'multi' ? 'block' : 'none';
        });
    });

    // 开始采集
    startBtn.addEventListener('click', async function() {
        try {
            const mode = document.querySelector('input[name="mode"]:checked').value;
            const pageCount = mode === 'multi' ? 
                document.querySelector('#pageCount input').value : 1;

            startBtn.disabled = true;
            statusSpan.textContent = '采集中...';

            // 发送消息给content script开始采集
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tab) {
                throw new Error('No active tab found');
            }

            chrome.tabs.sendMessage(tab.id, {
                action: 'startCollect',
                mode: mode,
                pageCount: parseInt(pageCount)
            }, response => {
                console.log('Collection start response:', response);
                if (!response) {
                    statusSpan.textContent = '采集失败: 无法连接到页面';
                    startBtn.disabled = false;
                }
            });

        } catch (err) {
            console.error('Error starting collection:', err);
            statusSpan.textContent = '采集失败: ' + err.message;
            startBtn.disabled = false;
        }
    });

    // 导出数据
    exportBtn.addEventListener('click', async function() {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        chrome.tabs.sendMessage(tab.id, {action: 'exportData'});
    });

    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('Received message in popup:', message);
        
        if (message.type === 'collectStatus') {
            // 只有在没有错误时才更新计数
            if (!message.error) {
                countSpan.textContent = `已采集：${message.count} 个店铺`;
                
                if (message.finished) {
                    statusSpan.textContent = '采集完成';
                    startBtn.disabled = false;
                    exportBtn.disabled = false;
                } else {
                    statusSpan.textContent = `正在采集第 ${message.currentPage}/${message.totalPages} 页`;
                }
            } else if (!statusSpan.textContent.includes('采集完成')) {
                // 只有在不是完成状态时才显示错误
                statusSpan.textContent = '采集失败: ' + message.error;
                startBtn.disabled = false;
            }
            
            sendResponse({received: true});
        }
        return true;
    });
});

// 更新状态显示
function updateStatus(response) {
    const statusElement = document.getElementById('status');
    if (response.error) {
        statusElement.textContent = `状态：采集失败: ${response.error}`;
    } else if (response.finished) {
        statusElement.textContent = `状态：采集完成`;
    } else {
        statusElement.textContent = `状态：正在采集第 ${response.currentPage}/${response.totalPages} 页`;
    }
    
    document.getElementById('count').textContent = 
        `已采集：${response.count} 个店铺`;
} 