// pages/favorites/favorites.js
Page({
  data: {
    currentTab: 'hairstyle',
    tabs: [
      { key: 'hairstyle', name: '收藏发型' },
      { key: 'outfit', name: '收藏穿搭' }
    ],
    favorites: []
  },

  onLoad() {
    this.loadFavorites()
  },

  onShow() {
    this.loadFavorites()
  },

  loadFavorites() {
    const favorites = wx.getStorageSync('favorites') || []
    this.setData({ favorites })
  },

  onSwitchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.key })
  },

  onRemoveFavorite(e) {
    const id = e.currentTarget.dataset.id
    const favorites = this.data.favorites.filter(f => f.id !== id)
    wx.setStorageSync('favorites', favorites)
    this.setData({ favorites })
    wx.showToast({ title: '已取消收藏', icon: 'success' })
  }
})
