/**
 * 店铺数据采集器
 */
class ShopCollector {
    constructor() {
        this.collectedData = [];
        this.currentPage = 1;
        this.targetPages = 1;
        this.isCollecting = false;
        this.isCompleted = false; // 添加完成标志
        this.setupMessageListener();
        console.log('ShopCollector initialized');
    }

    /**
     * 设置消息监听
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Received message:', message);
            
            if (message.action === 'startCollect') {
                // 如果已经在采集中，直接返回
                if (this.isCollecting) {
                    sendResponse({received: true, error: '采集正在进行中'});
                    return true;
                }
                this.startCollect(message.mode, message.pageCount);
                sendResponse({received: true});
            } else if (message.action === 'exportData') {
                // 只有在有数据时才导出
                if (this.collectedData.length > 0) {
                    this.exportToCSV();
                    sendResponse({received: true});
                } else {
                    sendResponse({received: false, error: '没有可导出的数据'});
                }
            }
            return true;
        });
    }

    /**
     * 等待元素加载
     * @param {string} selector - CSS选择器
     * @param {number} timeout - 超时时间（毫秒）
     */
    waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            // 首先检查常规 DOM
            let element = document.querySelector(selector);
            
            // 检查所有 iframe
            if (!element) {
                const iframes = document.querySelectorAll('iframe');
                for (const iframe of iframes) {
                    try {
                        element = iframe.contentDocument?.querySelector(selector);
                        if (element) break;
                    } catch (e) {
                        console.log('Cannot access iframe:', e);
                    }
                }
            }
            
            if (element) {
                return resolve(element);
            }

            const observer = new MutationObserver((mutations, obs) => {
                // 检查常规 DOM
                let found = document.querySelector(selector);
                
                // 检查所有 iframe
                if (!found) {
                    const iframes = document.querySelectorAll('iframe');
                    for (const iframe of iframes) {
                        try {
                            found = iframe.contentDocument?.querySelector(selector);
                            if (found) break;
                        } catch (e) {
                            console.log('Cannot access iframe:', e);
                        }
                    }
                }
                
                if (found) {
                    obs.disconnect();
                    resolve(found);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Timeout waiting for element'));
            }, timeout);
        });
    }

    /**
     * 提取当前页面数据
     * @returns {Promise<Array>} 店铺数据数组
     */
    async extractCurrentPageData() {
        try {
            // 调试信息
            console.log('Document ready state:', document.readyState);
            console.log('Current URL:', window.location.href);
            
            // 尝试在当前文档中查找表格
            let tableContainer = document.querySelector('.el-table__body-wrapper');
            let rows = [];
            
            if (!tableContainer) {
                console.log('Table not found in main document, checking iframes...');
                // 尝试在所有iframe中查找
                const iframes = Array.from(document.getElementsByTagName('iframe'));
                for (const iframe of iframes) {
                    try {
                        console.log('Checking iframe:', iframe.src);
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        tableContainer = iframeDoc.querySelector('.el-table__body-wrapper');
                        if (tableContainer) {
                            console.log('Found table in iframe');
                            rows = tableContainer.querySelectorAll('tr.el-table__row');
                            break;
                        }
                    } catch (e) {
                        console.log('Cannot access iframe:', e);
                    }
                }
            } else {
                rows = tableContainer.querySelectorAll('tr.el-table__row');
            }
            
            console.log('Found rows:', rows.length);
            
            if (rows.length === 0) {
                console.error('No rows found');
                if (tableContainer) {
                    console.log('Table container HTML:', tableContainer.innerHTML);
                }
                return [];
            }
            
            const shops = [];
            for (const row of rows) {
                try {
                    // 获取所有单元格
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 9) continue;
                    
                    // 店铺名称
                    const shopName = cells[2].querySelector('.src-css-product-storeTit-39uz')?.textContent?.trim() || '';
                    
                    // 销量数据
                    const totalSales = cells[3].querySelector('div[style*="display: inline-block"]')?.textContent?.trim() || '';
                    const weeklySales = cells[3].querySelector('.weekly_data')?.textContent?.replace('↑', '')?.trim() || '';
                    
                    // 评论数据
                    const totalReviews = cells[4].querySelector('div[style*="display: inline-block"]')?.textContent?.trim() || '';
                    const weeklyReviews = cells[4].querySelector('.weekly_data')?.textContent?.replace('↑', '')?.trim() || '';
                    
                    // 其他数据
                    const activeListings = cells[6].querySelector('.cell div')?.textContent?.trim() || '';
                    const openDate = cells[7].querySelector('.cell div')?.textContent?.trim() || '';
                    
                    if (shopName) {
                        const shopData = {
                            shopName,
                            totalSales,
                            weeklySales,
                            totalReviews,
                            weeklyReviews,
                            activeListings,
                            openDate
                        };
                        shops.push(shopData);
                        console.log('Extracted shop data:', shopData);
                    }
                } catch (err) {
                    console.error('Error processing row:', err);
                }
            }
            
            console.log('Total shops extracted:', shops.length);
            return shops;
            
        } catch (err) {
            console.error('Error in extractCurrentPageData:', err);
            return [];
        }
    }

    /**
     * 从iframe中提取数据
     * @param {HTMLIFrameElement} iframe - iframe元素
     * @returns {Promise<Array>} 店铺数据数组
     */
    async extractDataFromIframe(iframe) {
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const rows = iframeDoc.querySelectorAll('.el-table__body tr');
            console.log('Found rows in iframe:', rows.length);
            
            const shops = [];
            for (const row of rows) {
                try {
                    // 获取所有单元格
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 9) {
                        console.log('Invalid row (not enough cells):', row.innerHTML);
                        continue;
                    }

                    // 店铺名称 (第3列)
                    const shopNameElement = cells[2].querySelector('.eh-hover-text') || 
                                         cells[2].querySelector('.src-css-product-storeTit-39uz');
                    const shopName = shopNameElement?.textContent?.trim() || '';

                    // 销量数据 (第4列)
                    const salesCell = cells[3];
                    const totalSales = salesCell.querySelector('div[style*="display: inline-block"]')?.textContent?.trim() || '';
                    const weeklySales = salesCell.querySelector('.weekly_data')?.textContent?.replace('↑', '')?.trim() || '';

                    // 评论数据 (第5列)
                    const reviewCell = cells[4];
                    const totalReviews = reviewCell.querySelector('div[style*="display: inline-block"]')?.textContent?.trim() || '';
                    const weeklyReviews = reviewCell.querySelector('.weekly_data')?.textContent?.replace('↑', '')?.trim() || '';

                    // 其他数据
                    const activeListings = cells[6].querySelector('.cell div')?.textContent?.trim() || '';
                    const openDate = cells[7].querySelector('.cell div')?.textContent?.trim() || '';

                    if (shopName) {
                        const shopData = {
                            shopName,
                            totalSales,
                            weeklySales,
                            totalReviews,
                            weeklyReviews,
                            activeListings,
                            openDate
                        };
                        shops.push(shopData);
                        console.log('Extracted shop data:', shopData);
                    } else {
                        console.log('Failed to extract shop name from row:', row.innerHTML);
                    }
                } catch (err) {
                    console.error('Error processing row:', err);
                }
            }
            
            console.log('Total shops extracted:', shops.length);
            return shops;
            
        } catch (err) {
            console.error('Error extracting data from iframe:', err);
            return [];
        }
    }

    /**
     * 开始采集数据
     */
    async startCollect(mode, pageCount) {
        console.log('Starting collection:', {mode, pageCount});
        if (this.isCollecting) {
            console.log('Collection already in progress');
            return;
        }

        try {
            this.isCollecting = true;
            this.isCompleted = false; // 重置完成标志
            this.targetPages = pageCount || 1;
            this.currentPage = 1;
            this.collectedData = []; // 重置数据
            
            await this.collectPages();
        } catch (err) {
            console.error('Error in startCollect:', err);
            this.updateStatus(0, true, err.message);
        } finally {
            this.isCollecting = false;
        }
    }

    /**
     * 等待iframe加载并获取表格
     */
    async waitForTableInIframe() {
        // 如果已经完成采集，直接返回
        if (this.isCompleted) {
            return true;
        }

        // 等待iframe加载
        const iframe = await this.waitForElement('iframe');
        if (!iframe) {
            throw new Error('Iframe not found');
        }

        try {
            // 等待iframe内容加载
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const table = await new Promise((resolve) => {
                const observer = new MutationObserver((mutations, obs) => {
                    const tableEl = iframeDoc.querySelector('.el-table__body-wrapper table tbody tr');
                    if (tableEl) {
                        obs.disconnect();
                        resolve(tableEl);
                    }
                });

                observer.observe(iframeDoc.body, {
                    childList: true,
                    subtree: true,
                    attributes: true
                });

                // 立即检查一次
                const tableEl = iframeDoc.querySelector('.el-table__body-wrapper table tbody tr');
                if (tableEl) {
                    observer.disconnect();
                    resolve(tableEl);
                }
            });

            return table;
        } catch (e) {
            console.error('Error accessing iframe:', e);
            throw new Error('Cannot access iframe content');
        }
    }

    /**
     * 采集多个页面
     */
    async collectPages() {
        try {
            let successfullyCollectedData = [];
            
            while (this.currentPage <= this.targetPages) {
                // 如果已经完成采集，直接返回
                if (this.isCompleted) {
                    return;
                }

                // 等待iframe中的表格加载
                await this.waitForTableInIframe();
                
                // 采集当前页数据
                const currentPageData = await this.extractCurrentPageData();
                if (currentPageData.length === 0) {
                    throw new Error(`No data found on page ${this.currentPage}`);
                }
                
                // 添加到临时数组中
                successfullyCollectedData.push(...currentPageData);
                
                // 更新状态
                this.updateStatus(successfullyCollectedData.length, false);
                
                // 如果还有下一页，点击下一页
                if (this.currentPage < this.targetPages) {
                    const nextButton = await this.waitForElement('.btn-next:not(.is-disabled)');
                    if (!nextButton) {
                        console.log('No more pages available');
                        break;
                    }
                    
                    nextButton.click();
                    this.currentPage++;
                    
                    // 等待页面跳转完成
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    break;
                }
            }
            
            // 所有页面采集完成后，才更新 collectedData
            this.collectedData = successfullyCollectedData;
            
            // 完成采集
            this.updateStatus(this.collectedData.length, true);
            console.log('Collection completed:', this.collectedData);
            
        } catch (err) {
            console.error('Error in collectPages:', err);
            if (!this.isCompleted) {
                // 如果出错且未完成，保留已采集的数据
                this.updateStatus(this.collectedData.length, true, err.message);
            }
        }
    }

    /**
     * 更新采集状态
     */
    updateStatus(count, finished, error = null) {
        // 如果已经完成采集，不再更新状态
        if (this.isCompleted) {
            return;
        }

        // 如果是完成状态，设置完成标志
        if (finished && !error) {
            this.isCompleted = true;
        }

        chrome.runtime.sendMessage({
            type: 'collectStatus',
            count,
            finished,
            error,
            currentPage: this.currentPage,
            totalPages: this.targetPages
        });
    }

    /**
     * 导出数据到CSV
     */
    exportToCSV() {
        // 检查是否有数据可导出
        if (this.collectedData.length === 0) {
            console.log('No data to export');
            return;
        }

        const headers = ['店铺名', '总销量', '7日销量', '总评价数', '7日评价数', '在售商品数', '开店时间'];
        
        // 处理CSV数据，确保包含逗号的字段被正确引用
        const processField = (field) => {
            if (!field) return '';
            field = field.toString();
            // 如果字段包含逗号、引号或换行符，需要用引号包裹
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                // 将字段中的引号替换为两个引号（CSV标准）
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        const csvContent = [
            headers.join(','),
            ...this.collectedData.map(shop => [
                processField(shop.shopName),
                processField(shop.totalSales),
                processField(shop.weeklySales),
                processField(shop.totalReviews),
                processField(shop.weeklyReviews),
                processField(shop.activeListings),
                processField(shop.openDate)
            ].join(','))
        ].join('\n');

        // 添加 BOM 以确保 Excel 正确识别 UTF-8 编码
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `etsy_shops_${new Date().toISOString().slice(0,19).replace(/[:-]/g,'_')}.csv`;
        link.click();
    }
}

// 初始化采集器
const collector = new ShopCollector();
window.shopCollector = collector;

// 调试用：暴露一个全局函数用于手动测试
window.testExtraction = async () => {
    try {
        const shops = await collector.extractCurrentPageData();
        console.log('Test extraction result:', shops);
    } catch (err) {
        console.error('Test extraction failed:', err);
    }
}; 