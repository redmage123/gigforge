import Panel from '../components/ui/Panel'
import CandlestickChart from '../components/charts/CandlestickChart'

export default function Charts() {
  return (
    <div className="space-y-4">
      <Panel title="Price Chart">
        <CandlestickChart />
      </Panel>
    </div>
  )
}
