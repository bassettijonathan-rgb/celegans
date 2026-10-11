# C. elegans

A cell-by-cell *C. elegans* in the browser: all 302 neurons and 95 body-wall muscles, wired from
the measured connectome, driving a soft body that crawls on agar and swims in water. Nothing about
its behaviour is scripted; it has to come out of the cells, the wiring and the physics, and it is
checked against real experiments.

Play: https://bassettijonathan-rgb.github.io/celegans/ (`?seed=N` picks a plate)

See [DESIGN.md](DESIGN.md) for the model and the milestone plan.

```sh
npm install
npm run dev        # in the browser
npm test           # tests
npm run sim -- --seed 42 --seconds 10   # headless run
```
