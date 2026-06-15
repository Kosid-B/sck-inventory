import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Package, AlertTriangle, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface Product {
  id: string
  name: string
  current_stock: number
  min_quantity: number
  unit_price: number
  category: { id: string; name: string } | null
  unit: { name: string } | null
}

interface CategoryStock {
  name: string
  stockValue: number   // มูลค่ารวม (unit_price * current_stock)
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([])
  const [categoryStock, setCategoryStock] = useState<CategoryStock[]>([])
  const [loading, setLoading] = useState(true)
  const [totalStockValue, setTotalStockValue] = useState(0)

  useEffect(() => {
    fetchData()

    // Realtime subscription
    const channel = supabase
      .channel('products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchData() {
    setLoading(true)

    // ดึงข้อมูลสินค้าพร้อม category และ unit
    const { data: productsData, error } = await supabase
      .from('products')
      .select(`
        *,
        category:category_id (id, name),
        unit:unit_id (name)
      `)
      .order('name')

    if (error) {
      console.error('Error fetching products:', error)
      setLoading(false)
      return
    }

    const typedProducts = productsData as unknown as Product[]
    setProducts(typedProducts)

    // คำนวณมูลค่ารวมตามหมวดหมู่
    const categoryMap = new Map<string, number>()

    let totalValue = 0
    for (const p of typedProducts) {
      const value = (p.unit_price || 0) * (p.current_stock || 0)
      totalValue += value

      const categoryName = p.category?.name || 'ไม่ระบุหมวดหมู่'
      const current = categoryMap.get(categoryName) || 0
      categoryMap.set(categoryName, current + value)
    }

    setTotalStockValue(totalValue)

    // แปลง Map เป็น array สำหรับกราฟ
    const chartData: CategoryStock[] = Array.from(categoryMap.entries()).map(([name, stockValue]) => ({
      name,
      stockValue
    }))

    setCategoryStock(chartData)
    setLoading(false)
  }

  const lowStockCount = products.filter(p => p.current_stock <= p.min_quantity).length
  const totalItems = products.length

  if (loading) {
    return <div className="p-6">กำลังโหลดข้อมูล...</div>
  }

  // ฟังก์ชันจัดรูปแบบเงิน
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">แดชบอร์ดคลังสินค้า</h1>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-4 rounded-lg shadow flex items-center gap-4">
          <Package className="w-10 h-10 text-blue-500" />
          <div>
            <p className="text-gray-500">รายการสินค้าทั้งหมด</p>
            <p className="text-2xl font-bold">{totalItems}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow flex items-center gap-4">
          <AlertTriangle className="w-10 h-10 text-yellow-500" />
          <div>
            <p className="text-gray-500">สินค้าที่ต่ำกว่า Min Stock</p>
            <p className="text-2xl font-bold">{lowStockCount}</p>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow flex items-center gap-4">
          <TrendingUp className="w-10 h-10 text-green-500" />
          <div>
            <p className="text-gray-500">มูลค่าสต๊อกรวม (ต้นทุน)</p>
            <p className="text-2xl font-bold">{formatCurrency(totalStockValue)}</p>
          </div>
        </div>
      </div>

      {/* กราฟแท่งแสดงมูลค่าสต๊อกแยกหมวดหมู่ */}
      {categoryStock.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow mb-8">
          <h2 className="text-lg font-semibold mb-4">มูลค่าสต๊อกแยกหมวดหมู่ (บาท)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryStock}>
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip formatter={(value) => typeof value === 'number' ? formatCurrency(value) : ''} />
              <Bar dataKey="stockValue" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ตารางสินค้าที่ควรสั่งซื้อ */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">สินค้าที่ควรสั่งซื้อ (คงเหลือ ≤ Min Stock)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-2">หมวดหมู่</th>
                <th className="p-2">สินค้า</th>
                <th className="p-2">คงเหลือ</th>
                <th className="p-2">Min Stock</th>
                <th className="p-2">หน่วย</th>
                <th className="p-2">มูลค่า</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p => p.current_stock <= p.min_quantity).map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{p.category?.name || '-'}</td>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 text-red-600 font-semibold">{p.current_stock}</td>
                  <td className="p-2">{p.min_quantity}</td>
                  <td className="p-2">{p.unit?.name || '-'}</td>
                  <td className="p-2">{formatCurrency((p.unit_price || 0) * (p.current_stock || 0))}</td>
                </tr>
              ))}
              {lowStockCount === 0 && (
                <tr>
                  <td colSpan={6} className="p-2 text-gray-500 text-center">ไม่มีสินค้าใกล้หมด</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}